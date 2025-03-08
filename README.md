# Instagram Profile Viewer API

A Node.js API service that fetches and stores Instagram profile data and posts using the Supabase database.

## Features

- Fetch Instagram user profiles and posts
- Store profile information in Supabase
- Store post data including images, videos, and carousel posts
- Handle pagination for post retrieval
- Automatic deduplication of posts
- Support for various media types (images, videos, carousels)

## Prerequisites

- Node.js (v14 or higher)
- Supabase account and project
- Instagram API key from scrapecreators.com

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```plaintext
PORT=3000
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
INSTAGRAM_API_KEY=your_instagram_api_key
```

Installation
Clone the repository:
bash
Run
git clone https://github.com/yourusername/ProfileViewerAPI.gitcd ProfileViewerAPI
Install dependencies:
bash
Run
npm install
Start the server:
```
npm start
```
For development with auto-reload:
```
npm run dev
```

API Endpoints
Get Instagram Profile and Posts
plaintext

GET /api/instagram/:username
Parameters:

username (path parameter): Instagram username
cursor (query parameter, optional): Pagination cursor for fetching more posts
Example Request:

Run
```
curl http://localhost:3000/api/instagram/username
```
The API uses the following Supabase tables:

profiles

Stores user profile information
Fields: username, full_name, biography, followers_count, etc.
posts

Stores post metadata
Fields: profile_id, type, shortcode, display_url, timestamp, etc.
post_media

Stores media information for posts
Fields: post_id, type, display_url, media_order
processed_nodes

Tracks processed posts to avoid duplicates
Fields: id, username
Error Handling
The API includes comprehensive error handling:

Invalid username
API rate limiting
Database connection issues
Missing or invalid parameters
Development
The project uses the following development tools:

nodemon for auto-reloading during development
Environment variables for configuration
CORS enabled for cross-origin requests


