#!/bin/sh
# Runs the flight-model tests with the JavaScript engine built into macOS.
cd "$(dirname "$0")/.." || exit 1
exec /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc -m tests/run-jsc.js
