#!/usr/bin/env python3
"""
Generate iOS app icons from source icon
Scales up the design to fill more of the icon space for better visibility on iPhone
"""

import os
import sys
from pathlib import Path
from PIL import Image

# iOS icon sizes (base size × scale)
IOS_ICON_SIZES = [
    (20, 2, 'Icon-20@2x.png', 'iphone'),
    (20, 3, 'Icon-20@3x.png', 'iphone'),
    (29, 1, 'Icon-29@1x.png', 'iphone'),
    (29, 2, 'Icon-29@2x.png', 'iphone'),
    (29, 3, 'Icon-29@3x.png', 'iphone'),
    (40, 2, 'Icon-40@2x.png', 'iphone'),
    (40, 3, 'Icon-40@3x.png', 'iphone'),
    (60, 2, 'Icon-60@2x.png', 'iphone'),
    (60, 3, 'Icon-60@3x.png', 'iphone'),
    (20, 1, 'Icon-20@1x~ipad.png', 'ipad'),
    (20, 2, 'Icon-20@2x~ipad.png', 'ipad'),
    (29, 1, 'Icon-29@1x~ipad.png', 'ipad'),
    (29, 2, 'Icon-29@2x~ipad.png', 'ipad'),
    (40, 1, 'Icon-40@1x~ipad.png', 'ipad'),
    (40, 2, 'Icon-40@2x~ipad.png', 'ipad'),
    (76, 1, 'Icon-76@1x.png', 'ipad'),
    (76, 2, 'Icon-76@2x.png', 'ipad'),
    (83.5, 2, 'Icon-83.5@2x.png', 'ipad'),
    (1024, 1, 'Icon-1024.png', 'ios-marketing'),
]

def generate_icon(source_path, output_path, size, scale=1):
    """Generate an icon at the specified size, scaling up the design to fill more space"""
    final_size = int(size * scale)
    
    # Open source icon
    source_img = Image.open(source_path)
    
    # Scale up the design to 85% of icon size (instead of current ~60%)
    # This makes the design fill more space and be more visible on iPhone
    design_size = int(final_size * 0.85)
    
    # Resize the source image to the design size (maintains aspect ratio)
    source_img.thumbnail((design_size, design_size), Image.Resampling.LANCZOS)
    
    # Create a new white background image
    icon = Image.new('RGB', (final_size, final_size), 'white')
    
    # Calculate position to center the design
    x_offset = (final_size - source_img.width) // 2
    y_offset = (final_size - source_img.height) // 2
    
    # Paste the resized design onto the white background, centered
    if source_img.mode == 'RGBA':
        icon.paste(source_img, (x_offset, y_offset), source_img)
    else:
        icon.paste(source_img, (x_offset, y_offset))
    
    # Save the icon
    icon.save(output_path, 'PNG', optimize=True)
    return icon

def main():
    script_dir = Path(__file__).parent
    root_dir = script_dir.parent
    source_icon = root_dir / 'resources' / 'icon.png'
    ios_icon_dir = root_dir / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'AppIcon.appiconset'
    
    print('🎨 Generating iOS app icons with larger design...\n')
    
    if not source_icon.exists():
        print(f'❌ Source icon not found: {source_icon}')
        sys.exit(1)
    
    print(f'📁 Source icon: {source_icon}')
    print(f'📁 Output directory: {ios_icon_dir}\n')
    
    # Ensure output directory exists
    ios_icon_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate all icon sizes
    for size, scale, filename, idiom in IOS_ICON_SIZES:
        output_path = ios_icon_dir / filename
        final_size = int(size * scale)
        
        print(f'Generating {filename} ({final_size}x{final_size})...', end=' ')
        try:
            generate_icon(str(source_icon), str(output_path), size, scale)
            print('✅')
        except Exception as e:
            print(f'❌ Failed: {e}')
            sys.exit(1)
    
    print('\n✨ All iOS icons generated successfully!')
    print('\nThe design has been scaled up to 85% of icon size (from ~60%)')
    print('to fill more space and be more visible on iPhone home screens.\n')

if __name__ == '__main__':
    main()
