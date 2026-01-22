import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "NEEDS_REWORK", "REJECTED"]),
  comment: z.string().optional()
})

// PATCH /api/images/[id]/status - Update image status (approve/reject)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const validated = updateStatusSchema.parse(body)

    // Get the image
    const image = await prisma.generatedImage.findUnique({
      where: { id: params.id },
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
      where: { id: params.id },
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
    if (validated.comment) {
      await prisma.comment.create({
        data: {
          imageId: params.id,
          userId: (session.user as any).id,
          content: validated.comment,
          issueTag: validated.status === 'NEEDS_REWORK' ? 'REWORK_REQUESTED' : undefined
        }
      })
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: (session.user as any).id,
        action: `IMAGE_${validated.status}`,
        entityType: "GeneratedImage",
        entityId: image.id,
        metadata: {
          productId: image.product.id,
          productTitle: image.product.title,
          imageType: image.imageType.name,
          status: validated.status
        }
      }
    })

    // Update analytics
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const analyticsUpdate: any = {}
    if (validated.status === 'APPROVED') {
      analyticsUpdate.imagesApproved = { increment: 1 }
    } else if (validated.status === 'REJECTED') {
      analyticsUpdate.imagesRejected = { increment: 1 }
    }

    if (Object.keys(analyticsUpdate).length > 0) {
      await prisma.analytics.upsert({
        where: { date: today },
        create: {
          date: today,
          imagesApproved: validated.status === 'APPROVED' ? 1 : 0,
          imagesRejected: validated.status === 'REJECTED' ? 1 : 0
        },
        update: analyticsUpdate
      })
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

    const allApproved = productImages.every(img => img.status === 'APPROVED')
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
        { error: "Validation error", details: error.errors },
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
