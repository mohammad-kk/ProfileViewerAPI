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
const INSTAGRAM_API_URL = 'https://api.scrapecreators.com/v1/instagram/profile';
const INSTAGRAM_API_KEY = process.env.INSTAGRAM_API_KEY;

// Endpoint to fetch Instagram user profile and posts
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
        handle: username
      }
    });
    
    const userData = response.data.data.user;
    const postsData = userData.edge_owner_to_timeline_media;
    const posts = postsData.edges.map(edge => edge.node);
    const nextCursor = postsData.page_info.end_cursor;
    
    // Process and store profile and posts in Supabase
    if (posts && posts.length > 0) {
      await storeProfileAndPostsInDatabase(userData, posts, username);
    }
    
    // Return the response
    res.json({
      success: true,
      data: {
        user: userData,
        posts,
        cursor: nextCursor
      }
    });
  } catch (error) {
    console.error('Error fetching Instagram profile:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Instagram profile',
      message: error.message
    });
  }
});

// Function to store profile and posts in Supabase
async function storeProfileAndPostsInDatabase(userData, posts, username) {
  try {
    // Check if profile exists, if not create it
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single();
    
    let profileId;
    
    if (!profileData) {
      // Create new profile with data from the API
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({
          username,
          full_name: userData.full_name || '',
          biography: userData.biography || '',
          profile_data: userData ? JSON.stringify(userData) : null,
          profile_type: 'instagram',
          is_private: userData.is_private || false,
          followers_count: userData.edge_followed_by?.count || 0,
          following_count: userData.edge_follow?.count || 0,
          is_verified: userData.is_verified || false,
          is_car_profile: false,
          last_updated: new Date().toISOString()
        })
        .select('id')
        .single();
      
      profileId = newProfile.id;
    } else {
      // Update existing profile
      await supabase
        .from('profiles')
        .update({
          full_name: userData.full_name || '',
          biography: userData.biography || '',
          profile_data: userData ? JSON.stringify(userData) : null,
          is_private: userData.is_private || false,
          followers_count: userData.edge_followed_by?.count || 0,
          following_count: userData.edge_follow?.count || 0,
          is_verified: userData.is_verified || false,
          last_updated: new Date().toISOString()
        })
        .eq('id', profileData.id);
      
      profileId = profileData.id;
    }
    
    // Process each post
    for (const post of posts) {
      // Check if post already exists to avoid duplicates
      const { data: existingPost } = await supabase
        .from('processed_nodes')
        .select('id')
        .eq('id', post.id)
        .single();
      
      if (existingPost) {
        console.log(`Post ${post.id} already exists, skipping...`);
        continue;
      }
      
      // Insert post data
      const { data: postData } = await supabase
        .from('posts')
        .insert({
          profile_id: profileId,
          type: post.__typename.replace('Graph', '').toLowerCase(),
          shortcode: post.shortcode,
          display_url: post.display_url,
          timestamp: post.taken_at_timestamp,
          caption: post.edge_media_to_caption?.edges[0]?.node?.text || null,
          location: post.location ? JSON.stringify(post.location) : null,
          likes_count: post.edge_liked_by?.count || 0,
          username
        })
        .select('id')
        .single();
      
      // If it's a post with media, store media information
      if (post.is_video) {
        await supabase
          .from('post_media')
          .insert({
            post_id: postData.id,
            type: 'video',
            display_url: post.video_url || post.display_url,
            media_order: 0,
            username
          });
      } else if (post.edge_sidecar_to_children) {
        // Handle carousel posts
        const children = post.edge_sidecar_to_children.edges;
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
            display_url: post.display_url,
            media_order: 0,
            username
          });
      }
      
      // Add to processed_nodes to avoid duplicates in future
      await supabase
        .from('processed_nodes')
        .insert({
          id: post.id,
          username
        });
    }
    
    console.log(`Successfully stored profile and ${posts.length} posts for user ${username}`);
  } catch (error) {
    console.error('Error storing profile and posts in database:', error);
    throw error;
  }
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});