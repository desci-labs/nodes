#!/bin/bash

# Test the share image endpoint with simple parameters (no Supabase needed)
echo "Testing share image generation endpoint..."

# Test with simple text parameters
URL="http://localhost:5454/v1/services/generate-share-image"
PARAMS="?text=What%20is%20quantum%20computing%3F&answer=Quantum%20computing%20is%20a%20revolutionary%20approach%20to%20computation%20that%20leverages%20quantum%20mechanical%20phenomena.&refs=2"

echo "Testing: $URL$PARAMS"
curl -s "$URL$PARAMS" -o test-simple.png

if [ -f test-simple.png ]; then
    echo "✓ Image generated: test-simple.png"
    file test-simple.png
    ls -lh test-simple.png
else
    echo "✗ Failed to generate image"
fi

# Test with search ID (requires Supabase)
echo ""
echo "Testing with search ID (requires Supabase config)..."
SEARCH_ID="c773e5b6-c444-4ca9-b810-d69f4988009e"
curl -s "$URL?id=$SEARCH_ID" -o test-with-id.png

if [ -f test-with-id.png ]; then
    echo "✓ Image generated: test-with-id.png"
    file test-with-id.png
    ls -lh test-with-id.png
else
    echo "✗ Failed to generate image with ID (likely needs Supabase credentials)"
fi