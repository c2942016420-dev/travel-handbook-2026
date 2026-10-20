#!/usr/bin/env bash
set -euo pipefail
# Build without Gradle downloads; uses Google's SDK tools and a local JDK.
: "${ANDROID_HOME:?Set ANDROID_HOME}"
: "${JAVA_HOME:?Set JAVA_HOME to JDK 17}"
: "${YOUDU_KEYSTORE:?Set the private release keystore path}"
: "${YOUDU_STOREPASS_FILE:?Set the private password file path}"
cd "$(dirname "$0")"
TOOLS="$ANDROID_HOME/build-tools/34.0.0"
PLATFORM="$ANDROID_HOME/platforms/android-34/android.jar"
BUILD="$PWD/build/manual"
mkdir -p "$BUILD/classes" "$BUILD/dex" "$BUILD/res/drawable-nodpi"
cp ../assets/brand-logo.png "$BUILD/res/drawable-nodpi/brand_logo.png"
python3 - "$BUILD/AndroidManifest.xml" <<'PY'
import sys,xml.etree.ElementTree as ET
ET.register_namespace('android','http://schemas.android.com/apk/res/android')
a='{http://schemas.android.com/apk/res/android}'
t=ET.parse('app/src/main/AndroidManifest.xml');r=t.getroot()
r.set('package','com.youdu.teahouse');r.set(a+'versionCode','2');r.set(a+'versionName','10.0.1')
ET.SubElement(r,'uses-sdk',{a+'minSdkVersion':'24',a+'targetSdkVersion':'34'})
t.write(sys.argv[1],encoding='utf-8',xml_declaration=True)
PY
"$TOOLS/aapt" package -f -M "$BUILD/AndroidManifest.xml" -S "$BUILD/res" -I "$PLATFORM" -F "$BUILD/resources.apk"
"$JAVA_HOME/bin/javac" --release 8 -encoding UTF-8 -classpath "$PLATFORM" -d "$BUILD/classes" app/src/main/java/com/youdu/teahouse/MainActivity.java
"$JAVA_HOME/bin/jar" cf "$BUILD/classes.jar" -C "$BUILD/classes" .
"$TOOLS/d8" --release --min-api 24 --lib "$PLATFORM" --output "$BUILD/dex" "$BUILD/classes.jar"
cp "$BUILD/resources.apk" "$BUILD/unsigned.apk"
python3 - "$BUILD" <<'PY'
import sys,zipfile,pathlib
p=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(p/'unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:
    for f in (p/'dex').glob('*.dex'):z.write(f,f.name)
PY
"$TOOLS/zipalign" -f 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"
"$TOOLS/apksigner" sign --ks "$YOUDU_KEYSTORE" --ks-key-alias youdu --ks-pass "file:$YOUDU_STOREPASS_FILE" --out "$BUILD/Youdu-TeaHouse-V10.apk" "$BUILD/aligned.apk"
"$TOOLS/apksigner" verify --verbose "$BUILD/Youdu-TeaHouse-V10.apk"
"$TOOLS/aapt" dump badging "$BUILD/Youdu-TeaHouse-V10.apk"
