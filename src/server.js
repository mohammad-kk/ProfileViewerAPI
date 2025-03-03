const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Instagram API configuration
const INSTAGRAM_API_URL = 'https://api.scrapecreators.com/v1/instagram/user/posts';
const INSTAGRAM_API_KEY = process.env.INSTAGRAM_API_KEY;

// Endpoint to fetch Instagram user posts
app.get('/api/instagram/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { cursor } = req.query;
    
    // Fetch data from Instagram API
    const response = await axios.get(INSTAGRAM_API_URL, {
      headers: {
        'x-api-key': INSTAGRAM_API_KEY
      },
      params: {
        handle: username,
        cursor: cursor || undefined
      }
    });
    
    const { posts, cursor: nextCursor } = response.data;
    
    // Process and store posts in Supabase
    if (posts && posts.length > 0) {
      await storePostsInDatabase(posts, username);
    }
    
    // Return the response
    res.json({
      success: true,
      data: {
        posts,
        cursor: nextCursor
      }
    });
  } catch (error) {
    console.error('Error fetching Instagram posts:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Instagram posts',
      message: error.message
    });
  }
});

// Function to store posts in Supabase
async function storePostsInDatabase(posts, username) {
  try {
    for (const post of posts) {
      const { node } = post;
      
      // Check if profile exists, if not create it
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .single();
      
      let profileId;
      
      if (!profileData) {
        // Create new profile
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({
            username,
            profile_type: 'instagram',
            is_private: false,
            followers_count: 0,
            following_count: 0,
            is_verified: false,
            is_car_profile: false
          })
          .select('id')
          .single();
        
        profileId = newProfile.id;
      } else {
        profileId = profileData.id;
      }
      
      // Insert post data
      const { data: postData } = await supabase
        .from('posts')
        .insert({
          profile_id: profileId,
          type: node.__typename.replace('Graph', '').toLowerCase(),
          shortcode: node.shortcode,
          display_url: node.display_url,
          timestamp: node.taken_at_timestamp,
          caption: node.edge_media_to_caption?.edges[0]?.node?.text || null,
          location: node.location ? JSON.stringify(node.location) : null,
          likes_count: node.edge_liked_by?.count || 0,
          username
        })
        .select('id')
        .single();
      
      // If it's a post with media, store media information
      if (node.is_video) {
        await supabase
          .from('post_media')
          .insert({
            post_id: postData.id,
            type: 'video',
            display_url: node.video_url || node.display_url,
            media_order: 0,
            username
          });
      } else if (node.edge_sidecar_to_children) {
        // Handle carousel posts
        const children = node.edge_sidecar_to_children.edges;
        for (let i = 0; i < children.length; i++) {
          const child = children[i].node;
          await supabase
            .from('post_media')
            .insert({
              post_id: postData.id,
              type: child.__typename.replace('Graph', '').toLowerCase(),
              display_url: child.is_video ? (child.video_url || child.display_url) : child.display_url,
              media_order: i,
              username
            });
        }
      } else {
        // Single image post
        await supabase
          .from('post_media')
          .insert({
            post_id: postData.id,
            type: 'image',
            display_url: node.display_url,
            media_order: 0,
            username
          });
      }
      
      // Add to processed_nodes to avoid duplicates in future
      await supabase
        .from('processed_nodes')
        .insert({
          id: node.id,
          username
        });
    }
    
    console.log(`Successfully stored ${posts.length} posts for user ${username}`);
  } catch (error) {
    console.error('Error storing posts in database:', error);
    throw error;
  }
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});