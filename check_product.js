const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const product = await prisma.product.findUnique({
    where: { id: 'cmkf5d5ip0004r4ew44dy72f2' },
    include: {
      sourceImages: true,
      images: true
    }
  });
  
  console.log('Product:', JSON.stringify(product, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
