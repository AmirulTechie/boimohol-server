# Boimohol - Server

**Boimohol** is the backend API for an online book delivery management system. Built with Node.js, Express.js, and MongoDB, it powers all business logic including role-based access control, book inventory management, delivery lifecycle tracking, Stripe payment verification, and JWT-based authentication.

---

## Live API Base URL

[https://boimohol-server.onrender.com](https://boimohol-server.onrender.com)

---

## Project Purpose

This server handles all data operations, authentication verification, and third-party integrations for the Boimohol platform. It enforces role-based access for Readers, Librarians, and Admins, and exposes a RESTful API consumed by the Next.js frontend.

---

## Key Features

**Authentication and Authorization**
- JWT token issued on login, stored in HTTP-only cookies
- All protected routes verify the JWT from the request cookie
- Role-based middleware: guards routes per user role (user, librarian, admin)

**Book Management**
- Librarians submit books with an initial status of "Pending Approval"
- Admin approves or rejects pending books
- Books can be published, unpublished, edited, or deleted based on role
- imgBB is used for image hosting; the server stores image URLs

**Delivery Lifecycle**
- Delivery request created after successful Stripe payment
- Status flow: Pending -> Dispatched -> Delivered
- Librarians update delivery status; users track from their dashboard

**Payment Integration**
- Stripe Checkout session creation endpoint
- Webhook or success verification endpoint to confirm payment and create delivery record

**Verified Review System**
- Before saving a review, the API verifies that the requesting user has a delivery record with status "Delivered" for that specific book
- Prevents unverified reviews from being submitted

**Search, Filter, and Pagination**
- Browse endpoint supports query parameters for title search, category filter, fee range filter, availability filter, and page number
- Server-side pagination returns 6-12 books per page with total count metadata

**Admin Controls**
- Fetch all users, update roles, delete users
- Fetch all books platform-wide, forcibly unpublish or delete any listing
- Fetch all transactions with full metadata for the admin dashboard
- Platform-wide stats aggregation for dashboard charts

---

## Tech Stack

- Node.js
- Express.js
- MongoDB (Atlas)
- Mongoose
- JSON Web Token (JWT)
- Stripe
- CORS
- dotenv

---

## NPM Packages Used

| Package | Purpose |
|---|---|
| `express` | Web framework |
| `mongoose` | MongoDB ODM |
| `jsonwebtoken` | JWT creation and verification |
| `cookie-parser` | Parse HTTP cookies for JWT extraction |
| `cors` | Cross-origin request handling |
| `dotenv` | Environment variable management |
| `stripe` | Stripe server-side SDK |
| `morgan` | HTTP request logger for development |

---

## API Routes Overview

### Authentication
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register new user |
| POST | `/api/auth/login` | Public | Login and receive JWT cookie |
| POST | `/api/auth/logout` | Private | Clear session cookie |

### Books
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/books` | Public | Browse books with search, filter, pagination |
| GET | `/api/books/:id` | Public | Get single book details |
| POST | `/api/books` | Librarian | Add a new book (status: Pending Approval) |
| PATCH | `/api/books/:id` | Librarian / Admin | Update book details or status |
| DELETE | `/api/books/:id` | Librarian / Admin | Delete a book listing |

### Deliveries
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/deliveries` | User | Create delivery request after payment |
| GET | `/api/deliveries/my` | User | Get own delivery history |
| GET | `/api/deliveries/librarian` | Librarian | Get deliveries for own books |
| PATCH | `/api/deliveries/:id/status` | Librarian | Update delivery status |
| GET | `/api/deliveries/all` | Admin | Get all platform deliveries |

### Payments
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/payments/create-checkout-session` | User | Create Stripe checkout session |
| POST | `/api/payments/confirm` | User | Confirm payment and initiate delivery |
| GET | `/api/payments/all` | Admin | Get all transactions |

### Reviews
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/reviews` | User (Delivered) | Submit a verified review |
| GET | `/api/reviews/:bookId` | Public | Get reviews for a book |
| PATCH | `/api/reviews/:id` | User (Owner) | Edit own review |
| DELETE | `/api/reviews/:id` | User (Owner) | Delete own review |

### Admin
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/admin/users` | Admin | Get all users |
| PATCH | `/api/admin/users/:id/role` | Admin | Change user role |
| DELETE | `/api/admin/users/:id` | Admin | Delete a user |
| GET | `/api/admin/stats` | Admin | Get platform-wide analytics |
| GET | `/api/admin/books/pending` | Admin | Get all pending approval books |
| PATCH | `/api/admin/books/:id/approve` | Admin | Approve and publish a book |

---

## Deployment

This API is deployed on Render. All environment variables are configured in the Render project settings. The server does not throw CORS, 404, or 504 errors in production. CORS is configured to accept requests from the live frontend URL only.
