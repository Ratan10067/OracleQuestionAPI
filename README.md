# Oracle Question Storage API

Simple file-based API to store CodeMaze questions and test cases.

## Setup on Oracle

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/OracleQuestionAPI.git
cd OracleQuestionAPI

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env
nano .env  # Edit API_KEY to something secure

# 4. Run with PM2
pm2 start server.js --name question-api
pm2 save
```

## API Endpoints

| Method | Endpoint                   | Auth    | Description                   |
| ------ | -------------------------- | ------- | ----------------------------- |
| GET    | `/health`                  | No      | Health check                  |
| GET    | `/questions`               | No      | List all questions (metadata) |
| GET    | `/questions/:id`           | No      | Get full question by ID       |
| GET    | `/questions/:id/testcases` | No      | Get only test cases           |
| POST   | `/questions`               | API Key | Create question               |
| PUT    | `/questions/:id`           | API Key | Update question               |
| DELETE | `/questions/:id`           | API Key | Delete question               |
| POST   | `/questions/bulk`          | API Key | Bulk import                   |

## Authentication

For write operations, include API key in header:

```
X-API-Key: your_secret_key
```

## File Structure

```
data/
└── questions/
    ├── 507f1f77bcf86cd799439011.json
    ├── 507f191e810c19729de860ea.json
    └── ...
```
