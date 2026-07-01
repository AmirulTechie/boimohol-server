require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(cors({
  origin: ['https://boimohol-client-e9bw.vercel.app', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());

// ── Auth middleware ────────────────────────────────────────────────────────────

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing token' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.BETTER_AUTH_SECRET);
    req.user = decoded; // { userId, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    console.log('requireRole check — req.user:', JSON.stringify(req.user), 'allowed:', roles);
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: insufficient role' });
    }
    next();
  };
}

app.get('/', (req, res) => {
  res.send('This is the server of Boimohol!');
});

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const database = client.db('boimohol-db');
    const usersCollection = database.collection('user');
    const booksCollection = database.collection('books');
    const deliveriesCollection = database.collection('deliveries');
    const reviewsCollection = database.collection('reviews');

   // ── Users ──────────────────────────────────────────────────────────────

// All users — admin only
app.get('/users', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.json(users);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ /me routes FIRST — before /:id
app.get('/users/me', verifyToken, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/users/me', verifyToken, async (req, res) => {
  try {
    const { name, image } = req.body;
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $set: { name, image, updatedAt: new Date().toISOString() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ /:id routes AFTER
app.get('/users/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/users/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/users/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

    // ── Books ──────────────────────────────────────────────────────────────

    // Public — admin/home featured books, all unfiltered
app.get('/books/all', async (req, res) => {
  try {
    const books = await booksCollection.find().sort({ _id: -1 }).toArray();

    const booksWithLibrarians = await Promise.all(
      books.map(async (book) => {
        if (!book.librarian) return book;

        try {
          const librarian = await usersCollection.findOne(
            { _id: new ObjectId(book.librarian) },
            { projection: { name: 1, email: 1, image: 1, role: 1 } }
          );

          return {
            ...book,
            librarian,
          };
        } catch {
          return book;
        }
      })
    );

    res.json(booksWithLibrarians);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

    // Public — browse page with server-side filtering, search, and pagination
    app.get('/books', async (req, res) => {
      try {
        const {
          search,
          category,
          minFee,
          maxFee,
          availability,
          page = 1,
          limit = 10,
        } = req.query;

        const query = {};

        // Always exclude Pending Approval from public browse
        query.status = { $in: ['Published', 'Checked Out'] };

        // Search by title or author (case-insensitive)
        if (search && search.trim()) {
          query.$or = [
            { title:  { $regex: search.trim(), $options: 'i' } },
            { author: { $regex: search.trim(), $options: 'i' } },
          ];
        }

        // Category filter
        if (category && category !== 'All') {
          query.category = category;
        }

        // Delivery fee range
        if (minFee || maxFee) {
          query.deliveryFee = {};
          if (minFee) query.deliveryFee.$gte = parseFloat(minFee);
          if (maxFee) query.deliveryFee.$lte = parseFloat(maxFee);
        }

        // Availability filter
        if (availability && availability !== 'All') {
          if (availability === 'Available') {
            query.status = 'Published';
          } else if (availability === 'Checked Out') {
            query.status = 'Checked Out';
          }
        }

        const pageNum  = Math.max(1, parseInt(page));
        const limitNum = Math.min(20, Math.max(1, parseInt(limit)));
        const skip     = (pageNum - 1) * limitNum;

        const [books, total] = await Promise.all([
          booksCollection.find(query).sort({ _id: -1 }).skip(skip).limit(limitNum).toArray(),
          booksCollection.countDocuments(query),
        ]);

        res.json({
          books,
          total,
          page:       pageNum,
          totalPages: Math.ceil(total / limitNum),
          limit:      limitNum,
        });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Public — single book detail page
    app.get('/books/:id', async (req, res) => {
      try {
        const book = await booksCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!book) return res.status(404).json({ message: 'Book not found' });
        res.json(book);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Protected — librarian or admin only
    app.post('/books', verifyToken, requireRole('librarian', 'admin'), async (req, res) => {
  try {

    const book = {
      ...req.body,
      librarian: req.user.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await booksCollection.insertOne(book);

    res.status(201).json({
      success: true,
      result,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
    // PATCH /books/:id/status — any logged-in user (post-payment only)
app.patch('/books/:id/status', verifyToken, requireRole('user', 'librarian', 'admin'), async (req, res) => {
  console.log('ROLE FROM TOKEN:', JSON.stringify(req.user.role));
  console.log('STATUS BEING SET:', JSON.stringify(req.body.status));
  try {
    const { status } = req.body;

    const statusPermissions = {
      user: ['Checked Out', 'Pending Delivery'],
      librarian: ['Checked Out', 'Pending Delivery', 'Published', 'Rejected'],
      admin: ['Checked Out', 'Pending Delivery', 'Published', 'Rejected'],
    };

    const allowedForRole = statusPermissions[req.user.role] || [];
    if (!allowedForRole.includes(status)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    // Librarians may only change status on books they own
    if (req.user.role === 'librarian') {
      const book = await booksCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (!book) return res.status(404).json({ message: 'Book not found' });
      if (book.librarianId !== req.user.userId) {
        return res.status(403).json({ message: 'You can only edit your own books' });
      }
    }

    const result = await booksCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status, updatedAt: new Date().toISOString() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: 'Book not found' });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
    // Protected — librarian or admin only
    app.patch('/books/:id', verifyToken, requireRole('librarian', 'admin'), async (req, res) => {
      try {
        const updates = {
  ...req.body,
  updatedAt: new Date().toISOString(),
};
        const result = await booksCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: updates }
        );
        if (result.matchedCount === 0) return res.status(404).json({ message: 'Book not found' });
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Protected — librarian or admin only
    app.delete('/books/:id', verifyToken, requireRole('librarian', 'admin'), async (req, res) => {
      try {
        const result = await booksCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'Book not found' });
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ── Deliveries ─────────────────────────────────────────────────────────

    // Protected — any logged-in user (called after Stripe success)
    app.post('/deliveries', verifyToken, requireRole('user', 'librarian', 'admin'), async (req, res) => {
      try {
        const delivery = {
          ...req.body,
          status: 'Pending',
          createdAt: new Date().toISOString(),
        };
        const result = await deliveriesCollection.insertOne(delivery);
        res.status(201).json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Protected — admin only
    app.get('/deliveries', verifyToken, requireRole('admin'), async (req, res) => {
      try {
        const deliveries = await deliveriesCollection.find().toArray();
        res.json(deliveries);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Protected — any logged-in user (user views their own deliveries)
    app.get('/deliveries/user/:userId', verifyToken, requireRole('user', 'librarian', 'admin'), async (req, res) => {
      try {
        const deliveries = await deliveriesCollection
          .find({ userId: req.params.userId })
          .toArray();
        res.json(deliveries);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Protected — librarian or admin only
    app.get('/deliveries/librarian/:librarianId', verifyToken, requireRole('librarian', 'admin'), async (req, res) => {
      try {
        const deliveries = await deliveriesCollection
          .find({ librarianId: req.params.librarianId })
          .toArray();
        res.json(deliveries);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Protected — librarian or admin only (Pending → Dispatched → Delivered)
app.patch('/deliveries/:id', verifyToken, requireRole('librarian', 'admin'), async (req, res) => {
  try {
    const { status } = req.body;
    const result = await deliveriesCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status } }
    );
    if (result.matchedCount === 0)
      return res.status(404).json({ message: 'Delivery not found' });

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
    // ── Reviews ────────────────────────────────────────────────────────────

    // Public — anyone can read reviews
    app.get('/reviews/:bookId', async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find({ bookId: req.params.bookId })
          .sort({ createdAt: -1 })
          .toArray();
        res.json(reviews);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Public — user dashboard reads their own reviews
    app.get('/reviews/user/:userId', async (req, res) => {
  try {
    const reviews = await reviewsCollection
      .find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .toArray();

    const withTitles = await Promise.all(
      reviews.map(async (r) => {
        const book = await booksCollection.findOne(
          { _id: new ObjectId(r.bookId) },
          { projection: { title: 1 } }
        );
        return { ...r, bookTitle: book?.title ?? "Unknown book" };
      })
    );

    res.json(withTitles);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

    // Protected — any logged-in user (must have a Delivered delivery for this book)
    app.post('/reviews', verifyToken, requireRole('user', 'librarian', 'admin'), async (req, res) => {
      try {
        const { bookId, userId, rating, comment, userName, userImage } = req.body;

        // Guard — check if user has a delivered delivery for this book
        const eligibleDelivery = await deliveriesCollection.findOne({
          bookId,
          userId,
          status: 'Delivered',
        });

        if (!eligibleDelivery) {
          return res.status(403).json({
            success: false,
            message: 'You can only review books that have been delivered to you.',
          });
        }

        // Guard — check if user already reviewed this book
        const alreadyReviewed = await reviewsCollection.findOne({ bookId, userId });
        if (alreadyReviewed) {
          return res.status(409).json({
            success: false,
            message: 'You have already reviewed this book.',
          });
        }

        const review = {
          bookId,
          userId,
          userName,
          userImage: userImage || null,
          rating,
          comment,
          createdAt: new Date().toISOString(),
        };

        const result = await reviewsCollection.insertOne(review);
        res.status(201).json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Protected — any logged-in user (only their own reviews)
    app.delete('/reviews/:id', verifyToken, requireRole('user', 'librarian', 'admin'), async (req, res) => {
      try {
        const result = await reviewsCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        if (result.deletedCount === 0)
          return res.status(404).json({ message: 'Review not found' });
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Protected — any logged-in user (only their own reviews)
    app.patch('/reviews/:id', verifyToken, requireRole('user', 'librarian', 'admin'), async (req, res) => {
      try {
        const { rating, comment } = req.body;
        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { rating, comment } }
        );
        if (result.matchedCount === 0)
          return res.status(404).json({ message: 'Review not found' });
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });
    app.get("/health", (req, res) => {
    res.status(200).json({
    status: "OK",
    timestamp: new Date(),
    });
    });

    await client.db('admin').command({ ping: 1 });
    console.log('Pinged your deployment. Successfully connected to MongoDB!');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

run();

app.listen(port, () => {
  console.log(`Boimohol server listening on port ${port}`);
});