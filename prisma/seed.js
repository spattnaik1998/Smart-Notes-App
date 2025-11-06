const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Create a demo user
  const user = await prisma.user.upsert({
    where: { email: 'demo@notes.app' },
    update: {},
    create: {
      email: 'demo@notes.app',
      name: 'Demo User',
    },
  });

  console.log('✓ Created user:', user.email);

  // Create Chapter 1: Machine Learning Basics
  const chapter1 = await prisma.chapter.create({
    data: {
      userId: user.id,
      title: 'Machine Learning Basics',
      description: 'Fundamental concepts in ML and AI',
      position: 1,
    },
  });

  console.log('✓ Created chapter:', chapter1.title);

  // Create Chapter 2: Web Development
  const chapter2 = await prisma.chapter.create({
    data: {
      userId: user.id,
      title: 'Web Development',
      description: 'Modern web development practices and frameworks',
      position: 2,
    },
  });

  console.log('✓ Created chapter:', chapter2.title);

  // Create Note 1: Supervised Learning (text note in Chapter 1)
  const note1 = await prisma.note.create({
    data: {
      chapterId: chapter1.id,
      kind: 'text',
      title: 'Supervised Learning',
      bodyMd: `# Supervised Learning

Supervised learning is a type of machine learning where the model is trained on labeled data.

## Key Concepts:
- **Training Data**: Input-output pairs where the correct answer is known
- **Features**: Input variables used to make predictions
- **Labels**: The target variable we want to predict

## Common Algorithms:
1. Linear Regression
2. Logistic Regression
3. Decision Trees
4. Random Forests
5. Neural Networks

The goal is to learn a mapping function from inputs to outputs that can generalize to new, unseen data.`,
    },
  });

  console.log('✓ Created note:', note1.title);

  // Create Note 2: Neural Networks (text note in Chapter 1)
  const note2 = await prisma.note.create({
    data: {
      chapterId: chapter1.id,
      kind: 'text',
      title: 'Neural Networks Overview',
      bodyMd: `# Neural Networks

Neural networks are computing systems inspired by biological neural networks in animal brains.

## Architecture:
- **Input Layer**: Receives the initial data
- **Hidden Layers**: Process the data through weighted connections
- **Output Layer**: Produces the final prediction

## Key Components:
- Neurons (nodes)
- Weights and biases
- Activation functions (ReLU, Sigmoid, Tanh)
- Backpropagation for training

Deep learning uses neural networks with multiple hidden layers to learn hierarchical representations of data.`,
    },
  });

  console.log('✓ Created note:', note2.title);

  // Create Note 3: REST APIs (text note in Chapter 2)
  const note3 = await prisma.note.create({
    data: {
      chapterId: chapter2.id,
      kind: 'text',
      title: 'REST API Design Principles',
      bodyMd: `# REST API Design

REST (Representational State Transfer) is an architectural style for designing networked applications.

## Core Principles:
1. **Stateless**: Each request contains all information needed
2. **Client-Server**: Separation of concerns
3. **Cacheable**: Responses should define themselves as cacheable or not
4. **Uniform Interface**: Consistent way to interact with resources

## HTTP Methods:
- \`GET\`: Retrieve a resource
- \`POST\`: Create a new resource
- \`PUT/PATCH\`: Update a resource
- \`DELETE\`: Remove a resource

## Best Practices:
- Use nouns for endpoints (\`/users\`, not \`/getUsers\`)
- Use HTTP status codes correctly (200, 201, 400, 404, 500)
- Version your API (\`/api/v1/...\`)
- Implement proper error handling`,
      elaborationJson: JSON.stringify({
        summary: 'REST APIs provide a standardized way for applications to communicate over HTTP, following principles of statelessness, client-server separation, and uniform interfaces.',
        elaboratedContent: 'This is a placeholder for AI-generated elaboration.',
        references: [],
      }),
    },
  });

  console.log('✓ Created note:', note3.title);

  // Create some sample references for note3
  await prisma.reference.createMany({
    data: [
      {
        noteId: note3.id,
        rank: 1,
        title: 'REST API Tutorial',
        url: 'https://restfulapi.net/',
        snippet: 'Learn about REST API design principles and best practices',
      },
      {
        noteId: note3.id,
        rank: 2,
        title: 'HTTP Methods - MDN Web Docs',
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods',
        snippet: 'Reference documentation for HTTP request methods',
      },
      {
        noteId: note3.id,
        rank: 3,
        title: 'RESTful API Design Guide',
        url: 'https://stackoverflow.blog/2020/03/02/best-practices-for-rest-api-design/',
        snippet: 'Best practices for designing REST APIs from Stack Overflow',
      },
    ],
  });

  console.log('✓ Created 3 references for note:', note3.title);

  // Summary
  const chapterCount = await prisma.chapter.count();
  const noteCount = await prisma.note.count();
  const referenceCount = await prisma.reference.count();

  console.log('\n📊 Seed Summary:');
  console.log(`   Users: 1`);
  console.log(`   Chapters: ${chapterCount}`);
  console.log(`   Notes: ${noteCount}`);
  console.log(`   References: ${referenceCount}`);
  console.log('\n✅ Database seeded successfully!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
