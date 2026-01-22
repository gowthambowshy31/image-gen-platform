import { GET } from '@/app/api/products/route'
import { prisma } from '@/lib/prisma'
import { NextRequest } from 'next/server'

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
    },
  },
}))

// Mock auth
jest.mock('@/lib/auth', () => ({
  auth: jest.fn(() => Promise.resolve({
    user: { id: 'test-user', email: 'test@example.com', role: 'ADMIN' }
  })),
}))

describe('/api/products', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET', () => {
    it('should return products with inventory > 0', async () => {
      const mockProducts = [
        {
          id: '1',
          title: 'Test Product 1',
          asin: 'B001',
          status: 'NOT_STARTED',
          category: 'Electronics',
          metadata: { inventory: { quantity: 10 } },
          createdBy: { id: 'user1', name: 'User 1', email: 'user1@test.com' },
          sourceImages: [],
          images: [],
          _count: { images: 0, sourceImages: 5 },
          createdAt: new Date(),
        },
        {
          id: '2',
          title: 'Test Product 2',
          asin: 'B002',
          status: 'IN_PROGRESS',
          category: 'Home',
          metadata: { inventory: { quantity: 0 } },
          createdBy: { id: 'user1', name: 'User 1', email: 'user1@test.com' },
          sourceImages: [],
          images: [],
          _count: { images: 2, sourceImages: 3 },
          createdAt: new Date(),
        },
      ]

      ;(prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts)

      const request = new NextRequest('http://localhost:3000/api/products')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveLength(1)
      expect(data[0].id).toBe('1')
      expect(data[0].metadata.inventory.quantity).toBeGreaterThan(0)
    })

    it('should filter by status query parameter', async () => {
      const mockProducts = [
        {
          id: '1',
          title: 'Test Product',
          status: 'IN_PROGRESS',
          metadata: { inventory: { quantity: 5 } },
          createdBy: { id: 'user1', name: 'User 1', email: 'user1@test.com' },
          sourceImages: [],
          images: [],
          _count: { images: 0, sourceImages: 0 },
          createdAt: new Date(),
        },
      ]

      ;(prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts)

      const request = new NextRequest('http://localhost:3000/api/products?status=IN_PROGRESS')
      const response = await GET(request)

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'IN_PROGRESS' }),
        })
      )
    })

    it('should require authentication', async () => {
      const { auth } = require('@/lib/auth')
      auth.mockResolvedValueOnce(null)

      const request = new NextRequest('http://localhost:3000/api/products')
      const response = await GET(request)

      expect(response.status).toBe(401)
    })
  })
})
