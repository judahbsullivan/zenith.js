#!/bin/bash

# Script to create .icns file from SVG and set it as the icon for .zen files
# Usage: ./create-zen-icon.sh

SVG_FILE="C691FF58-ED13-4E8D-B6A3-02E835849340.svg"
ICONSET_DIR="zen.iconset"
ICNS_FILE="zen.icns"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Creating .icns file from SVG...${NC}"

# Create iconset directory
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

# Convert SVG to PNG at various sizes required for .icns
# macOS requires specific sizes: 16x16, 32x32, 128x128, 256x256, 512x512, and @2x versions

echo "Converting SVG to PNG at required sizes..."

# 16x16
sips -s format png -z 16 16 "$SVG_FILE" --out "${ICONSET_DIR}/icon_16x16.png" > /dev/null 2>&1
sips -s format png -z 32 32 "$SVG_FILE" --out "${ICONSET_DIR}/icon_16x16@2x.png" > /dev/null 2>&1

# 32x32
sips -s format png -z 32 32 "$SVG_FILE" --out "${ICONSET_DIR}/icon_32x32.png" > /dev/null 2>&1
sips -s format png -z 64 64 "$SVG_FILE" --out "${ICONSET_DIR}/icon_32x32@2x.png" > /dev/null 2>&1

# 128x128
sips -s format png -z 128 128 "$SVG_FILE" --out "${ICONSET_DIR}/icon_128x128.png" > /dev/null 2>&1
sips -s format png -z 256 256 "$SVG_FILE" --out "${ICONSET_DIR}/icon_128x128@2x.png" > /dev/null 2>&1

# 256x256
sips -s format png -z 256 256 "$SVG_FILE" --out "${ICONSET_DIR}/icon_256x256.png" > /dev/null 2>&1
sips -s format png -z 512 512 "$SVG_FILE" --out "${ICONSET_DIR}/icon_256x256@2x.png" > /dev/null 2>&1

# 512x512
sips -s format png -z 512 512 "$SVG_FILE" --out "${ICONSET_DIR}/icon_512x512.png" > /dev/null 2>&1
sips -s format png -z 1024 1024 "$SVG_FILE" --out "${ICONSET_DIR}/icon_512x512@2x.png" > /dev/null 2>&1

# Create .icns file
echo "Creating .icns file..."
iconutil -c icns "$ICONSET_DIR" -o "$ICNS_FILE"

# Clean up iconset directory
rm -rf "$ICONSET_DIR"

if [ -f "$ICNS_FILE" ]; then
    echo -e "${GREEN}✓ Created ${ICNS_FILE}${NC}"
    echo ""
    echo -e "${YELLOW}To set this as the icon for .zen files:${NC}"
    echo "1. Open Finder and navigate to a .zen file"
    echo "2. Right-click the file and select 'Get Info'"
    echo "3. Drag the ${ICNS_FILE} file onto the small icon in the top-left of the Get Info window"
    echo "4. Close the Get Info window"
    echo ""
    echo "Or use this command (replace PATH_TO_ZEN_FILE with actual path):"
    echo "  fileicon set PATH_TO_ZEN_FILE $ICNS_FILE"
    echo ""
    echo "Note: For system-wide association, you may need to install 'fileicon':"
    echo "  brew install fileicon"
else
    echo -e "${YELLOW}✗ Failed to create .icns file${NC}"
    exit 1
fi

