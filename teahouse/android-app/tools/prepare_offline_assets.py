#!/usr/bin/env python3
"""Build the Huawei APK's self-contained offline front-end.
No build step touches or imports business records, credentials, or user devices.
The existing hosted PWA files remain unchanged.
"""
from pathlib import Path
import re
import shutil
import subprocess
import sys

PROJECT = Path(__file__).resolve().parents[3]
TEA = PROJECT / "teahouse"
OUTPUT = TEA / "android-app/app/src/main/assets/youdu"
EXTRA = TEA / "android-app/tools/native-offline-v14_1.js"

REQUIRED = [
    "enhancements-v17-reports.js",
    "enhancements-v7.js",
    "backup-client-v7.js",
    "corrections-v8.js",
    "sync-client-v12.js",
    "receipt-client-v17.js",
    "excel-v15.js",
    "enhancements-v17.js",
    "theme-v9.css",
    "manifest.webmanifest",
    "assets/brand-logo.png",
    "assets/theme-bamboo.svg",
    "assets/theme-leaf.svg",
    "assets/app-icon.svg",
]

def abort(msg):
    raise SystemExit("OFFLINE_BUNDLE_ERROR: " + msg)

def main():
    original = (TEA / "index.html").read_text(encoding="utf-8")
    # The iPhone read-only guard is web-only; it is intentionally not bundled in
    # the offline Android APK. Android receives its own independent native guard.
    original = original.replace('<script src="./iphone-viewer-v17.js"></script>', '')

    original = original.replace("有度茶舍 · 店务管理 V17（iPhone 云端查看）", "有度茶舍 · 店务管理 正式版 V17")
    original = original.replace("有度茶舍 · 店务管理 V13", "有度茶舍 · 店务管理 正式版 V17")
    if "const KEY='youdu_tea_house_v3'" not in original:
        abort("business data storage key changed unexpectedly")
    if "class=\"brand-logo\"" not in original or "data:image/png;base64," not in original:
        abort("original user logo was not present")

    save_call = "localStorage.setItem(KEY,JSON.stringify(data));"
    if original.count(save_call) != 1:
        abort("ledger save hook did not match exactly once")
    original = original.replace(save_call,
        "const ledgerString=JSON.stringify(data);"
        "localStorage.setItem(KEY,ledgerString);"
        "try{window.YouduNative?.checkpoint(ledgerString);}catch(_){}")

    bootstrap = """<script>
    (function(){
      try{
        const key='youdu_tea_house_v3';
        const native=window.YouduNative;
        if(!native)return;
        const old=localStorage.getItem(key);
        let validOld=false;
        try{
          const value=JSON.parse(old);
          validOld=!!(value&&value.version===3&&Array.isArray(value.orders)&&
            Array.isArray(value.inventory)&&Array.isArray(value.products));
        }catch(_){}
        if(!validOld){
          const fallback=native.recoverCheckpoint();
          if(fallback){
            const s=JSON.parse(fallback);
            if(s&&s.version===3&&Array.isArray(s.orders)&&Array.isArray(s.inventory)
              &&Array.isArray(s.products))localStorage.setItem(key,fallback);
          }
        }
      }catch(_){}
    })();
    </script>
    """
    anchor = "<script>function p(id,name,category,cup,pot)"
    if original.count(anchor) != 1:
        abort("main application script start was not found")
    original = original.replace(anchor, bootstrap + anchor)
    original = original.replace('<span class="top-state">本地演示</span>',
                                '<span class="top-state">离线收银</span>')

    # The PWA service worker is unnecessary, and can accidentally route the offline APK
    # back to the network, so remove only the installation/help footer in this APK.
    pattern = re.compile(
        r"<script>\s*\(function\(\)\{\s*const bar=document\.getElementById\('offlineBar'\)"
        r".*?</script>\s*(?=</body></html>\s*$)", re.DOTALL)
    original, n = pattern.subn('<script src="./native-offline-v14_1.js"></script>\n', original)
    if n != 1:
        abort("PWA service worker footer was not replaced exactly once")

    if "serviceWorker.register(" in original:
        abort("unexpected remote dependency in APK")
    if original.count('<script src="./native-offline-v14_1.js"></script>') != 1:
        abort("native offline adapter missing")
    for js in ("enhancements-v17-reports.js","enhancements-v7.js",
               "backup-client-v7.js","corrections-v8.js","sync-client-v12.js","receipt-client-v17.js"):
        if original.count('<script src="./'+js+'"></script>') != 1:
            abort("missing original functionality: "+js)

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "index.html").write_text(original, encoding="utf-8")
    for relative in REQUIRED:
        src = TEA / relative
        if not src.exists():
            abort("missing resource: "+relative)
        dst = OUTPUT / relative
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    if not EXTRA.exists():
        abort("offline adapter JS missing")
    shutil.copy2(EXTRA, OUTPUT / "native-offline-v14_1.js")

    external = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', original)
    external += re.findall(r'<link[^>]+href=["\']([^"\']+)["\']', original)
    for url in external:
        if url.startswith("data:"):
            continue
        if not url.startswith("./"):
            abort("unbundled remote resource: "+url)
        if not (OUTPUT / url[2:]).is_file():
            abort("unbundled asset: "+url)

    # Test JS parseability when Node.js is available.
    for js in OUTPUT.glob("*.js"):
        subprocess.run(["node","--check",str(js)],check=True)
    inline = re.findall(r"<script(?:\s[^>]*)?>(.*?)</script>", original, re.DOTALL)
    for idx, code in enumerate(inline):
        temp = OUTPUT / ("_test_inline_%d.js" % idx)
        try:
            temp.write_text(code, encoding="utf-8")
            subprocess.run(["node","--check",str(temp)],check=True)
        finally:
            temp.unlink(missing_ok=True)

    print("OFFLINE_V17_BUNDLE_OK")
    print("Bundled:", ", ".join(sorted(str(p.relative_to(OUTPUT))
        for p in OUTPUT.rglob("*") if p.is_file())))
    print("Original logo preserved; persistent key preserved; network free first launch.")

if __name__=="__main__":
    main()


