# AI Media Generator - Image & Video Generation Platform

A powerful web application for generating high-quality images and videos using Google Gemini AI (Gemini 2.5 Flash Image & Veo 3.1).

## Features

### Core Functionality
- **AI Image Generation**: Generate stunning images from text prompts using Gemini 2.5 Flash Image
- **AI Video Generation**: Create 4-second videos in 720p using Veo 3.1
- **Real-time Progress**: Live updates during video generation
- **Download Generated Media**: Save images and videos directly
- **Simple Interface**: Clean, intuitive UI with no authentication required

### Technical Features
- **Instant Image Generation**: High-quality PNG images in seconds
- **Video Generation**: Professional 720p videos (16:9 aspect ratio)
- **Automatic Polling**: Real-time status updates for video generation
- **File Management**: Automatic storage in public/uploads directory
- **Error Handling**: Clear error messages and status updates

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React, TailwindCSS
- **Backend**: Next.js API Routes
- **AI**:
  - Google Gemini 2.5 Flash Image for image generation
  - Google Veo 3.1 Generate Preview for video generation
- **Type Safety**: TypeScript

## Prerequisites

- Node.js 18+
- Google Gemini API key with billing enabled

## Installation

### 1. Clone and Install Dependencies

```bash
cd image-gen-platform
npm install
```

### 2. Configure Environment Variables

Create a `.env` file with:

```env
# Google Gemini AI
GEMINI_API_KEY="your-gemini-api-key-here"

# File Storage
UPLOAD_DIR="./public/uploads"
```

### 3. Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key
3. **Important**: Enable billing in [Google Cloud Console](https://console.cloud.google.com/billing) for video generation
4. Add the API key to your `.env` file as `GEMINI_API_KEY`

### 4. Create Upload Directory

```bash
mkdir -p public/uploads
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage Guide

### Generate an Image

1. Open the application at `http://localhost:3000`
2. Make sure the "Image Generation" tab is selected
3. Enter a descriptive prompt (e.g., "A beautiful sunset over the ocean with birds flying")
4. Click "Generate Image"
5. Wait a few seconds for the image to be generated
6. View and download your generated image

### Generate a Video

1. Open the application at `http://localhost:3000`
2. Click on the "Video Generation" tab
3. Enter a descriptive prompt (e.g., "A peaceful ocean wave rolling onto a sandy beach at sunset")
4. Click "Generate Video"
5. Wait 1-2 minutes while the video is being generated (progress updates will appear)
6. Once complete, view and download your generated video

### Tips for Better Prompts

**For Images:**
- Be specific about the scene, lighting, and style
- Include details about colors, composition, and mood
- Example: "Professional product photo of a red backpack on white background, studio lighting, high quality"

**For Videos:**
- Describe the motion and camera movement
- Include details about the setting and atmosphere
- Example: "Slow motion of a coffee cup being filled with steaming coffee, morning sunlight, warm colors"

## API Endpoints

### Image Generation
- **POST** `/api/generate-image`
  - Body: `{ "prompt": "your image description" }`
  - Returns: `{ "success": true, "url": "/uploads/filename.png", "size": 1234567 }`

### Video Generation
- **POST** `/api/generate-video`
  - Body: `{ "prompt": "your video description", "aspectRatio": "16:9", "durationSeconds": 4, "resolution": "720p" }`
  - Returns: `{ "success": true, "operationName": "models/veo.../operations/..." }`

### Check Video Status
- **POST** `/api/check-video-status`
  - Body: `{ "operationName": "models/veo.../operations/..." }`
  - Returns: `{ "success": true, "done": true, "url": "/uploads/filename.mp4" }`

## Project Structure

```
image-gen-platform/
├── app/
│   ├── api/
│   │   ├── generate-image/       # Image generation endpoint
│   │   ├── generate-video/       # Video generation start endpoint
│   │   └── check-video-status/   # Video status polling endpoint
│   ├── page.tsx                  # Main UI component
│   └── layout.tsx                # Root layout
├── public/
│   └── uploads/                  # Generated images and videos
└── .env                          # Environment variables
```

## Troubleshooting

### Image Generation Fails
- Check that GEMINI_API_KEY is valid
- Ensure the API key has proper permissions
- Verify the prompt is clear and descriptive

### Video Generation Fails
- **Billing Required**: Video generation requires billing to be enabled on your Google Cloud account
- Visit [Google Cloud Console Billing](https://console.cloud.google.com/billing) to enable billing
- Check that GEMINI_API_KEY is valid
- Ensure the upload directory exists and is writable
- Video generation takes 1-2 minutes - be patient!

### Upload Directory Issues
- Ensure `public/uploads` directory exists
- Check directory has write permissions
- Create manually if needed: `mkdir -p public/uploads`

## Supported Models

### Image Generation
- **gemini-2.5-flash-image**: Fast, high-quality image generation
- **imagen-4.0-generate-001**: Standard Imagen 4
- **imagen-4.0-ultra-generate-001**: Highest quality Imagen 4 Ultra
- **imagen-4.0-fast-generate-001**: Fastest Imagen 4

### Video Generation
- **veo-3.1-generate-preview**: Latest Veo 3.1 (used by default)
- **veo-3.0-generate-001**: Stable Veo 3
- **veo-3.0-fast-generate-001**: Fast Veo 3
- **veo-2.0-generate-001**: Stable Veo 2

## Official Documentation

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Veo Video Generation Guide](https://ai.google.dev/gemini-api/docs/video)
- [Image Generation with Gemini](https://ai.google.dev/gemini-api/docs/imagen)

## Production Deployment

### Environment Variables
Set production environment variables:
- Use a secure GEMINI_API_KEY
- Configure proper file storage (S3, Cloudflare R2, etc.)
- Set up CDN for serving generated media

### Build
```bash
npm run build
npm start
```

### Recommendations
- Use cloud storage (AWS S3, Google Cloud Storage) instead of local file system
- Implement rate limiting on API endpoints
- Add user authentication if needed
- Monitor API usage and costs
- Set up proper error logging and monitoring

## Cost Considerations

- **Image Generation**: ~$0.04 per image (prices vary by model)
- **Video Generation**: ~$0.40 per 4-second video (720p)
- Prices are approximate and may change - check [Google AI Pricing](https://ai.google.dev/pricing)

## License

MIT License - feel free to use for your projects!
