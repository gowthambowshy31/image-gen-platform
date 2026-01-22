import { POST } from '@/app/api/images/generate/route'
import { prisma } from '@/lib/prisma'
import { generateImage } from '@/lib/gemini'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findUnique: jest.fn() },
    imageType: { findUnique: jest.fn() },
    promptOverride: { findUnique: jest.fn() },
    generatedImage: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    activityLog: { create: jest.fn() },
    analytics: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/gemini', () => ({
  generateImage: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(() => Promise.resolve({
    user: { id: 'test-user', email: 'test@example.com', role: 'ADMIN' }
  })),
}))

describe('/api/images/generate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST', () => {
    it('should generate an image successfully', async () => {
      const mockProduct = {
        id: 'product-1',
        title: 'Test Product',
        asin: 'B001',
        category: 'Electronics',
        status: 'NOT_STARTED',
        sourceImages: [{
          id: 'source-1',
          localFilePath: '/uploads/source-images/test.jpg',
        }],
      }

      const mockImageType = {
        id: 'type-1',
        name: 'Front View',
        defaultPrompt: 'Create a front view of {product_name}',
      }

      const mockGeneratedImage = {
        id: 'generated-1',
        productId: 'product-1',
        imageTypeId: 'type-1',
        status: 'COMPLETED',
        version: 1,
        fileName: 'test_Front_View_v1_123.png',
        filePath: '/uploads/test_Front_View_v1_123.png',
      }

      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct)
      ;(prisma.imageType.findUnique as jest.Mock).mockResolvedValue(mockImageType)
      ;(prisma.promptOverride.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.generatedImage.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.generatedImage.create as jest.Mock).mockResolvedValue(mockGeneratedImage)
      ;(prisma.generatedImage.update as jest.Mock).mockResolvedValue({ ...mockGeneratedImage, imageType: mockImageType, product: mockProduct })
      ;(prisma.activityLog.create as jest.Mock).mockResolvedValue({})
      ;(prisma.analytics.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.analytics.create as jest.Mock).mockResolvedValue({})

      ;(generateImage as jest.Mock).mockResolvedValue({
        success: true,
        width: 1024,
        height: 1024,
        fileSize: 500000,
      })

      const request = new NextRequest('http://localhost:3000/api/images/generate', {
        method: 'POST',
        body: JSON.stringify({
          productId: 'product-1',
          imageTypeId: 'type-1',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.status).toBe('COMPLETED')
      expect(generateImage).toHaveBeenCalled()
    })

    it('should return 404 if product not found', async () => {
      ;(prisma.product.findUnique as jest.Mock).mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/api/images/generate', {
        method: 'POST',
        body: JSON.stringify({
          productId: 'invalid-product',
          imageTypeId: 'type-1',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(404)
    })

    it('should require authentication', async () => {
      const { auth } = require('@/lib/auth')
      auth.mockResolvedValueOnce(null)

      const request = new NextRequest('http://localhost:3000/api/images/generate', {
        method: 'POST',
        body: JSON.stringify({
          productId: 'product-1',
          imageTypeId: 'type-1',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(401)
    })

    it('should validate request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/images/generate', {
        method: 'POST',
        body: JSON.stringify({
          // Missing required fields
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
    })
  })
})
