"""
Remove the beige/cream background from hero-woman-new.jpg
using a flood-fill approach from corner pixels, then save as PNG with transparency.
"""
from PIL import Image
import numpy as np
from collections import deque

src = r"d:\testingNyayadepaa\auth_app\frontend\public\hero-woman-new.jpg"
dst = r"d:\testingNyayadepaa\auth_app\frontend\public\hero-woman-transparent.png"

img = Image.open(src).convert("RGBA")
data = np.array(img, dtype=np.int32)

h, w = data.shape[:2]

# Sample background color from multiple corners
corners = [(0,0),(0,w-1),(h-1,0),(h-1,w-1),(0,w//2),(h//2,0),(h//2,w-1)]
bg_samples = [data[y,x,:3] for y,x in corners]
bg_color = np.mean(bg_samples, axis=0)  # average background color
print(f"Detected background color: R={bg_color[0]:.0f} G={bg_color[1]:.0f} B={bg_color[2]:.0f}")

# Tolerance — how close a pixel needs to be to background to be removed
TOLERANCE = 30

def color_dist(px, ref):
    return np.sqrt(np.sum((px[:3] - ref) ** 2))

# BFS flood fill from all 4 corners + edges
visited = np.zeros((h, w), dtype=bool)
queue = deque()

# Seed from all edge pixels that match background
for y in range(h):
    for x in [0, w-1]:
        if not visited[y,x] and color_dist(data[y,x], bg_color) < TOLERANCE:
            queue.append((y,x))
            visited[y,x] = True
for x in range(w):
    for y in [0, h-1]:
        if not visited[y,x] and color_dist(data[y,x], bg_color) < TOLERANCE:
            queue.append((y,x))
            visited[y,x] = True

print(f"Flood fill queue started with {len(queue)} seed pixels...")

while queue:
    y, x = queue.popleft()
    # Make this pixel transparent
    data[y, x, 3] = 0
    for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
        ny, nx = y+dy, x+dx
        if 0 <= ny < h and 0 <= nx < w and not visited[ny,nx]:
            if color_dist(data[ny,nx], bg_color) < TOLERANCE:
                visited[ny,nx] = True
                queue.append((ny,nx))

print("Flood fill done. Saving PNG...")
result = Image.fromarray(data.astype(np.uint8))
result.save(dst, "PNG")
print(f"Saved to {dst}")
