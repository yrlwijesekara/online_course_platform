# Online Course Platform

A Node.js and Express-based online course platform with MongoDB integration.

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/yrlwijesekara/online_course_platform.git
   cd online_course_platform
   ```

2. Install dependencies:
   ```bash
   cd backend
   npm install
   ```

3. Environment Configuration:
   - Copy `.env.example` to `.env`
   - Update the database URL and other configuration values in `.env`

4. Start the development server:
   ```bash
   npm start
   ```

## Environment Variables

- `DATABASE_URL`: MongoDB connection string
- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment (development/production)
- `JWT_SECRET`: Secret key for JWT tokens

## Project Structure

```
online_course_platform/
├── backend/
│   ├── index.js          # Main server file
│   ├── package.json      # Dependencies
│   └── node_modules/     # Installed packages
├── .env                  # Environment variables (not in git)
├── .env.example          # Environment template
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

## API Endpoints

- `POST /` - Create a new course

## Technologies Used

- Node.js
- Express.js
- MongoDB with Mongoose
- dotenv for environment variables
