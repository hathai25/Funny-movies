import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_USERS = [
  { email: 'alice@example.com', name: 'Alice Demo', password: 'password123' },
  { email: 'bob@example.com', name: 'Bob Demo', password: 'password123' },
];

async function main() {
  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, name: u.name, passwordHash },
    });
  }

  console.log('Seeded demo users:');
  for (const u of DEMO_USERS) {
    console.log(`  ${u.email}  /  ${u.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
