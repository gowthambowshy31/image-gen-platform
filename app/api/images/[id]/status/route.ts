import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "NEEDS_REWORK", "REJECTED"]),
  comment: z.string().optional()
})

// PATCH /api/images/[id]/status - Update image status (approve/reject)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get default admin user for logging
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    })

    const body = await request.json()
    const validated = updateStatusSchema.parse(body)

    // Get the image
    const image = await prisma.generatedImage.findUnique({
      where: { id },
      include: {
        product: true,
        imageType: true
      }
    })

    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 })
    }

    // Update image status
    const updatedImage = await prisma.generatedImage.update({
      where: { id },
      data: {
        status: validated.status
      },
      include: {
        product: true,
        imageType: true,
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })

    // Add comment if provided
    if (validated.comment && adminUser) {
      await prisma.comment.create({
        data: {
          imageId: id,
          userId: adminUser.id,
          content: validated.comment,
          issueTag: validated.status === 'NEEDS_REWORK' ? 'REWORK_REQUESTED' : undefined
        }
      })
    }

    // Log activity
    if (adminUser) {
      await prisma.activityLog.create({
        data: {
          userId: adminUser.id,
          action: `IMAGE_${validated.status}`,
        entityType: "GeneratedImage",
        entityId: image.id,
        metadata: {
          productId: image.product.id,
          productTitle: image.product.title,
          imageType: image.imageType?.name,
          status: validated.status
        }
      }
      })
    }

    // Update analytics
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (validated.status === 'APPROVED' || validated.status === 'REJECTED') {
      // Find or create today's analytics record
      let analytics = await prisma.analytics.findFirst({
        where: {
          date: {
            gte: today,
            lt: tomorrow
          }
        }
      })

      if (analytics) {
        await prisma.analytics.update({
          where: { id: analytics.id },
          data: validated.status === 'APPROVED'
            ? { imagesApproved: { increment: 1 } }
            : { imagesRejected: { increment: 1 } }
        })
      } else {
        await prisma.analytics.create({
          data: {
            date: today,
            imagesApproved: validated.status === 'APPROVED' ? 1 : 0,
            imagesRejected: validated.status === 'REJECTED' ? 1 : 0
          }
        })
      }
    }

    // Check if all images for this product are approved
    const productImages = await prisma.generatedImage.findMany({
      where: {
        productId: image.productId
      },
      select: {
        status: true
      }
    })

    const allApproved = productImages.every((img: { status: string }) => img.status === 'APPROVED')
    if (allApproved && productImages.length > 0) {
      await prisma.product.update({
        where: { id: image.productId },
        data: { status: 'COMPLETED' }
      })
    }

    return NextResponse.json(updatedImage)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error updating image status:", error)
    return NextResponse.json(
      { error: "Failed to update image status" },
      { status: 500 }
    )
  }
}
