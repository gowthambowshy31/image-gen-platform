import { generateImage } from '../lib/gemini'
import path from 'path'
import fs from 'fs/promises'

async function testImageGeneration() {
  console.log('🧪 Testing Image Generation...\n')

  try {
    // Find a source image from the product
    const productId = 'cmk2efv4o05avb0ewz6gehomn'
    const sourceImageDir = path.join(process.cwd(), 'public', 'uploads', 'source-images', productId)

    // Check if source images exist
    try {
      const files = await fs.readdir(sourceImageDir)
      const imageFiles = files.filter(f => f.match(/\.(jpg|jpeg|png)$/i))

      if (imageFiles.length === 0) {
        console.log('❌ No source images found')
        return
      }

      const sourceImagePath = path.join(sourceImageDir, imageFiles[0])
      console.log('✅ Found source image:', imageFiles[0])

      // Generate test output
      const outputPath = path.join(
        process.cwd(),
        'public',
        'uploads',
        `test_generation_${Date.now()}.png`
      )

      console.log('\n📸 Generating image...')
      const result = await generateImage({
        prompt: 'Create a professional product image with clean white background',
        sourceImagePath,
        outputPath,
        width: 1024,
        height: 1024
      })

      if (result.success) {
        console.log('\n✅ Image generated successfully!')
        console.log('   File:', result.fileName)
        console.log('   Size:', `${result.width}x${result.height}`)
        console.log('   File size:', `${Math.round((result.fileSize || 0) / 1024)}KB`)
        console.log(`   URL: http://localhost:3002/uploads/${result.fileName}`)
        console.log('\n💡 You can view this image in your browser!')
      } else {
        console.log('\n❌ Image generation failed:', result.error)
      }
    } catch (err) {
      console.log('❌ Error reading source images:', err)
    }
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

testImageGeneration()
