require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(cors());
app.use(express.json());

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

    app.get('/users', async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.json(users);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get('/users/:id', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.patch('/users/:id', async (req, res) => {
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

    app.delete('/users/:id', async (req, res) => {
      try {
        const result = await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'User not found' });
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ── Books ──────────────────────────────────────────────────────────────
    // GET all books unfiltered — for admin/internal use
app.get('/books/all', async (req, res) => {
  try {
    const books = await booksCollection.find().sort({ _id: -1 }).toArray(); // ← add sort
    res.json(books);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
    // GET all books — with server-side filtering, search, and pagination
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
    query.status = { $ne: 'Pending Approval' };

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
        // Available means Published and not checked out
        query.status = 'Published';
      } else if (availability === 'Checked Out') {
        query.status = 'Checked Out';
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(20, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [books, total] = await Promise.all([
  booksCollection.find(query).sort({ _id: -1 }).skip(skip).limit(limitNum).toArray(), // ← add sort
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

    app.get('/books/:id', async (req, res) => {
      try {
        const book = await booksCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!book) return res.status(404).json({ message: 'Book not found' });
        res.json(book);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.post('/books', async (req, res) => {
      try {
        const result = await booksCollection.insertOne(req.body);
        res.status(201).json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.patch('/books/:id', async (req, res) => {
      try {
        const updates = req.body;
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

    app.delete('/books/:id', async (req, res) => {
      try {
        const result = await booksCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'Book not found' });
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ── Deliveries ─────────────────────────────────────────────────────────

    // POST — create a new delivery (called after Stripe success)
    app.post('/deliveries', async (req, res) => {
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

    // GET all deliveries (admin)
    app.get('/deliveries', async (req, res) => {
      try {
        const deliveries = await deliveriesCollection.find().toArray();
        res.json(deliveries);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // GET deliveries by userId (user dashboard)
    app.get('/deliveries/user/:userId', async (req, res) => {
      try {
        const deliveries = await deliveriesCollection
          .find({ userId: req.params.userId })
          .toArray();
        res.json(deliveries);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // GET deliveries by librarianId (librarian dashboard)
    app.get('/deliveries/librarian/:librarianId', async (req, res) => {
      try {
        const deliveries = await deliveriesCollection
          .find({ librarianId: req.params.librarianId })
          .toArray();
        res.json(deliveries);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // PATCH delivery status (librarian updates Pending→Dispatched→Delivered)
    app.patch('/deliveries/:id', async (req, res) => {
      try {
        const { status } = req.body;
        const result = await deliveriesCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status } }
        );
        if (result.matchedCount === 0)
          return res.status(404).json({ message: 'Delivery not found' });

        // If status is Delivered, also update the book status back to Available
        if (status === 'Delivered') {
          const delivery = await deliveriesCollection.findOne({
            _id: new ObjectId(req.params.id),
          });
          if (delivery?.bookId) {
            await booksCollection.updateOne(
              { _id: new ObjectId(delivery.bookId) },
              { $set: { status: 'Available' } }
            );
          }
        }

        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ── Reviews ────────────────────────────────────────────────────────────

    // GET reviews by bookId
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
    // GET reviews by userId (user dashboard)
  app.get('/reviews/user/:userId', async (req, res) => {
  try {
    const reviews = await reviewsCollection
      .find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
    // POST a review — only if user has a Delivered delivery for this book
    app.post('/reviews', async (req, res) => {
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

    // DELETE a review (user deletes their own)
    app.delete('/reviews/:id', async (req, res) => {
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

    // PATCH a review (user edits their own)
    app.patch('/reviews/:id', async (req, res) => {
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