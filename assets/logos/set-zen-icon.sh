#!/bin/bash

# Script to set the Zenith icon for .zen files
# Usage: ./set-zen-icon.sh [path_to_zen_file]

ICNS_FILE="zen.icns"
ZEN_FILE="${1:-}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ ! -f "$ICNS_FILE" ]; then
    echo -e "${RED}Error: ${ICNS_FILE} not found. Run create-zen-icon.sh first.${NC}"
    exit 1
fi

if [ -z "$ZEN_FILE" ]; then
    echo -e "${YELLOW}Usage: ./set-zen-icon.sh <path_to_zen_file>${NC}"
    echo ""
    echo "Example:"
    echo "  ./set-zen-icon.sh ../playground/app.zen"
    echo ""
    echo "Or to set for all .zen files in a directory:"
    echo "  find ../playground -name '*.zen' -exec ./set-zen-icon.sh {} \\;"
    exit 1
fi

if [ ! -f "$ZEN_FILE" ]; then
    echo -e "${RED}Error: File not found: ${ZEN_FILE}${NC}"
    exit 1
fi

# Check if fileicon is installed
if command -v fileicon &> /dev/null; then
    echo -e "${GREEN}Setting icon for ${ZEN_FILE}...${NC}"
    fileicon set "$ZEN_FILE" "$ICNS_FILE"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Icon set successfully!${NC}"
    else
        echo -e "${RED}✗ Failed to set icon${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}fileicon not found. Installing via Homebrew...${NC}"
    if command -v brew &> /dev/null; then
        brew install fileicon
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}Setting icon for ${ZEN_FILE}...${NC}"
            fileicon set "$ZEN_FILE" "$ICNS_FILE"
        else
            echo -e "${RED}Failed to install fileicon${NC}"
            echo ""
            echo "Manual method:"
            echo "1. Open Finder and navigate to: $(dirname "$(realpath "$ZEN_FILE")")"
            echo "2. Right-click on $(basename "$ZEN_FILE") and select 'Get Info'"
            echo "3. Drag ${ICNS_FILE} onto the small icon in the Get Info window"
            exit 1
        fi
    else
        echo -e "${RED}Homebrew not found. Please install fileicon manually:${NC}"
        echo "  brew install fileicon"
        echo ""
        echo "Or use the manual method:"
        echo "1. Open Finder and navigate to: $(dirname "$(realpath "$ZEN_FILE")")"
        echo "2. Right-click on $(basename "$ZEN_FILE") and select 'Get Info'"
        echo "3. Drag ${ICNS_FILE} onto the small icon in the Get Info window"
        exit 1
    fi
fi

