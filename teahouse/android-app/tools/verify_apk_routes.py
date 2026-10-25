#!/usr/bin/env python3
"""Verify bundled assets against the Android router compiled into the actual APK."""
from pathlib import Path
from zipfile import ZipFile
import json
import re
import struct
import sys


def uleb(data, offset):
    value = shift = 0
    while True:
        byte = data[offset]
        offset += 1
        value |= (byte & 127) << shift
        if not byte & 128:
            return value, offset
        shift += 7


def method_code(data, owner, name):
    count, offset = struct.unpack_from('<II', data, 56)
    strings = []
    for i in range(count):
        at = struct.unpack_from('<I', data, offset + 4 * i)[0]
        _, at = uleb(data, at)
        strings.append(data[at:data.index(0, at)].decode('utf-8', errors='replace'))
    count, offset = struct.unpack_from('<II', data, 64)
    types = [struct.unpack_from('<I', data, offset + 4 * i)[0] for i in range(count)]
    count, offset = struct.unpack_from('<II', data, 88)
    target = None
    for i in range(count):
        class_index, _, name_index = struct.unpack_from('<HHI', data, offset + 8 * i)
        if strings[name_index] == name and strings[types[class_index]] == owner:
            target = (i, class_index)
            break
    if target is None:
        return None
    count, offset = struct.unpack_from('<II', data, 96)
    for i in range(count):
        at = offset + 32 * i
        if struct.unpack_from('<I', data, at)[0] != target[1]:
            continue
        at = struct.unpack_from('<I', data, at + 24)[0]
        counts = []
        for _ in range(4):
            value, at = uleb(data, at)
            counts.append(value)
        for _ in range(counts[0] + counts[1]):
            _, at = uleb(data, at)
            _, at = uleb(data, at)
        for total in counts[2:]:
            method_index = 0
            for _ in range(total):
                delta, at = uleb(data, at)
                _, at = uleb(data, at)
                code_offset, at = uleb(data, at)
                method_index += delta
                if method_index == target[0]:
                    length = struct.unpack_from('<I', data, code_offset + 12)[0]
                    return strings, struct.unpack_from('<' + 'H' * length, data, code_offset + 16)
    raise AssertionError('Android router method has no executable code')


def router_literals(strings, instructions):
    # buildMimeMap is deliberately an explicit, unrolled list of Map.put calls.
    # Reject unexpected bytecode instead of guessing instruction boundaries.
    widths = {0x00: 1, 0x07: 1, 0x08: 2, 0x09: 3, 0x0c: 1, 0x11: 1,
              0x12: 1, 0x13: 2, 0x1a: 2, 0x1b: 3, 0x22: 2}
    widths.update({op: 3 for op in [0x6e, 0x6f, 0x70, 0x71, 0x72, 0x74, 0x75, 0x76, 0x77, 0x78]})
    found = set()
    i = 0
    while i < len(instructions):
        opcode = instructions[i] & 255
        assert opcode in widths, 'Unexpected router bytecode opcode: ' + hex(opcode)
        if opcode in (0x1a, 0x1b):
            index = instructions[i + 1]
            if opcode == 0x1b:
                index |= instructions[i + 2] << 16
            found.add(strings[index])
        i += widths[opcode]
    assert i == len(instructions)
    return found


def verify(apk):
    with ZipFile(apk) as archive:
        bundled = {name[len('assets/youdu/'):] for name in archive.namelist()
                   if name.startswith('assets/youdu/') and not name.endswith('/')}
        assert 'index.html' in bundled
        compiled = None
        for name in archive.namelist():
            if re.fullmatch(r'classes\d*\.dex', name):
                compiled = method_code(archive.read(name), 'Lcom/youdu/teahouse/MainActivity;', 'buildMimeMap')
                if compiled is not None:
                    break
        assert compiled is not None, 'Compiled Android local router was not found'
        allowed = router_literals(*compiled)
        blocked = sorted(bundled - allowed)
        assert not blocked, 'APK native router would return 403 for: ' + ', '.join(blocked)
        return {'apk': str(apk), 'bundledResources': len(bundled),
                'compiledAndroidRouter': 'verified', 'blockedResources': []}


if __name__ == '__main__':
    print(json.dumps(verify(Path(sys.argv[1]))))
