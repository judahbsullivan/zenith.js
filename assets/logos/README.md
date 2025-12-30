# Zenith Logos

This directory contains the Zenith framework logo assets.

## Logo Files

Based on the logo designs, you should place the following files here:

1. **zenith-logo-icon.png** (or .svg) - The file icon version with the folded corner and ".ZENITH" button
2. **zenith-logo-z.png** (or .svg) - The stylized "Z" logo with gradient and light trails
3. **zenith-logo-full.png** (or .svg) - The full logo with "ZENITH" text below
4. **zenith-logo-soon.png** (or .svg) - The logo variant with "Soon" text

## File Icon for .zen Files

The SVG logo has been converted to a macOS `.icns` file to use as the file icon for `.zen` files.

### Setting the Icon

**Option 1: Use the automated script (recommended)**
```bash
cd assets/logos
./set-zen-icon.sh path/to/your/file.zen
```

**Option 2: Set icon for all .zen files in a directory**
```bash
cd assets/logos
find ../playground -name "*.zen" -exec ./set-zen-icon.sh {} \;
```

**Option 3: Manual method**
1. Open Finder and navigate to a `.zen` file
2. Right-click the file and select "Get Info"
3. Drag `zen.icns` onto the small icon in the top-left of the Get Info window
4. Close the Get Info window

### Recreating the .icns File

If you update the SVG and need to regenerate the `.icns` file:
```bash
cd assets/logos
./create-zen-icon.sh
```

## Usage

These logos can be used in:
- Documentation (`docs/`)
- README files
- Website/marketing materials
- Framework branding
- File type icons (`.zen` files)

