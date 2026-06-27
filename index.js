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

    // ── Users ──────────────────────────────────────────────────────────────

    // GET all users
    app.get('/users', async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.json(users);
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // GET single user by id
    app.get('/users/:id', async (req, res) => {
      try {
        const user = await usersCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // PATCH user role
    app.patch('/users/:id', async (req, res) => {
      try {
        const { role } = req.body;
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { role } }
        );
        if (result.matchedCount === 0)
          return res.status(404).json({ message: 'User not found' });
        res.json({ success: true, result });
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // DELETE user
    app.delete('/users/:id', async (req, res) => {
      try {
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        if (result.deletedCount === 0)
          return res.status(404).json({ message: 'User not found' });
        res.json({ success: true, result });
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ── Books ──────────────────────────────────────────────────────────────

    // GET all books
    app.get('/books', async (req, res) => {
      try {
        const books = await booksCollection.find().toArray();
        res.json(books);
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // GET single book by id
    app.get('/books/:id', async (req, res) => {
      try {
        const book = await booksCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!book) return res.status(404).json({ message: 'Book not found' });
        res.json(book);
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // POST add a book
    app.post('/books', async (req, res) => {
      try {
        const result = await booksCollection.insertOne(req.body);
        res.status(201).json({ success: true, result });
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // PATCH book status (or any other fields)
    app.patch('/books/:id', async (req, res) => {
      try {
        const { status, ...rest } = req.body;
        const updates = { ...(status && { status }), ...rest };
        const result = await booksCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: updates }
        );
        if (result.matchedCount === 0)
          return res.status(404).json({ message: 'Book not found' });
        res.json({ success: true, result });
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // DELETE book
    app.delete('/books/:id', async (req, res) => {
      try {
        const result = await booksCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        if (result.deletedCount === 0)
          return res.status(404).json({ message: 'Book not found' });
        res.json({ success: true, result });
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ── Health check ───────────────────────────────────────────────────────
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