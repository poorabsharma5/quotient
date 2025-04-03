const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");

const port = 3019;
const app = express();

app.use(session({
    secret: "quotient",
    resave: false,
    saveUninitialized: true,
    rolling: true, // Refresh session expiration on each request
    cookie: { 
        secure: false,
        maxAge: 7 * 24 * 60 * 60 * 1000 // Session expires after 7 days of inactivity
    }
}));

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// MongoDB local connection configuration
const MONGO_URI = 'mongodb://127.0.0.1:27017/quotient';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("Connected to local MongoDB successfully");
    })
    .catch(err => {
        console.error("MongoDB connection error:", err);
        console.log("\nTroubleshooting steps:");
        console.log("1. Make sure MongoDB is installed");
        console.log("2. Ensure MongoDB service is running");
        console.log("3. Check if MongoDB Compass can connect to mongodb://localhost:27017");
    });

const db = mongoose.connection;
db.once("open", () => console.log("Database connection established successfully"));

const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    username: String,
    joinedCommunities: [{ type: String }]
});

const User = mongoose.model("User", userSchema);

const postSchema = new mongoose.Schema({
    title: String,
    brief: String,
    community: String,
    username: String,
    createdAt: { type: Date, default: Date.now },
    reactions: {
        "👍": { 
            count: { type: Number, default: 0 },
            users: [{ type: String }]  // Array of usernames who reacted
        },
        "😂": { 
            count: { type: Number, default: 0 },
            users: [{ type: String }]
        },
        "😢": { 
            count: { type: Number, default: 0 },
            users: [{ type: String }]
        },
        "🔥": { 
            count: { type: Number, default: 0 },
            users: [{ type: String }]
        },
        "🙏": { 
            count: { type: Number, default: 0 },
            users: [{ type: String }]
        }
    },
    comments: [{
        username: String,
        content: String,
        createdAt: { type: Date, default: Date.now }
    }]
});

const communitySchema = new mongoose.Schema({
    community: String,
    age: Number,
    description: String,
    members: [{ type: String }]
});

const Post = mongoose.model("Post", postSchema);
const Community = mongoose.model("Community", communitySchema);

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/login", async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username });

        if (user && user.password === req.body.password) {
            req.session.username = user.username;
            res.redirect("/home.html");
        } else {
            res.status(401).json({ error: "Invalid username or password" });
        }
    } catch (err) {
        res.status(500).json({ error: "Error logging in" });
    }
});

app.post("/create-community", async (req, res) => {
    let { community, age, description } = req.body;

    if (!community.startsWith("quo.")) {
        community = `quo.${community}`;
    }

    const existingCommunity = await Community.findOne({ community });
    if (existingCommunity) {
        return res.status(400).json({ error: "Community name already exists!" });
    }

    const newCommunity = new Community({ community, age, description, members: [] });
    await newCommunity.save();
    res.redirect("/home.html");
});

app.post("/create-post", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    const { title, brief, community } = req.body;
    const username = req.session.username;

    const user = await User.findOne({ username });

    if (!user.joinedCommunities.includes(community)) {
        return res.status(403).json({ error: "You must join the community first." });
    }

    const newPost = new Post({ username, community, title, brief });
    await newPost.save();
    res.redirect("/home.html");
});

app.post("/join-community", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    const { community } = req.body;
    const user = await User.findOne({ username: req.session.username });
    const comm = await Community.findOne({ community });

    if (!comm) {
        return res.status(400).json({ error: "Community does not exist." });
    }

    if (!user.joinedCommunities.includes(community)) {
        user.joinedCommunities.push(community);
        await user.save();
        comm.members.push(user.username);
        await comm.save();
    }

    res.json({ message: "Joined community successfully!" });
});

app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login.html");
});

app.get("/get-communities", async (req, res) => {
    try {
        const communities = await Community.find({}, "community");
        res.json(communities.map(c => c.community));
    } catch (error) {
        console.error("Error fetching communities:", error);
        res.status(500).json([]);
    }
});


app.get("/getPosts", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json([]);
    }

    const user = await User.findOne({ username: req.session.username });

    if (!user || !Array.isArray(user.joinedCommunities)) {
        return res.json([]);
    }

    const posts = await Post.find({ community: { $in: user.joinedCommunities } });

    res.json(posts || []);
});


app.get("/get-user-communities", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json([]);
    }

    const user = await User.findOne({ username: req.session.username });

    res.json(user?.joinedCommunities || []);
});


app.post("/register", async (req, res) => {
    const { name, email, password, username } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return res.json({ error: "Username already taken." });
    }

    const user = new User({ name, email, password, username, joinedCommunities: [] });
    await user.save();
    req.session.username = username;
    res.redirect("/home.html");
});

// Get current user
app.get('/api/current-user', (req, res) => {
    if (req.session.username) {
        res.json({ username: req.session.username });
    } else {
        res.status(401).json({ error: 'Not logged in' });
    }
});

// Get single post
app.get('/api/post/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        res.json(post);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Add comment to post
app.post('/api/post/:id/comment', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        post.comments.push({
            username: req.session.username,
            content: req.body.content
        });

        await post.save();
        res.json(post);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Add/toggle reaction to post
app.post('/leave-community', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    try {
        const { community } = req.body;
        const username = req.session.username;

        // Update User document
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        user.joinedCommunities = user.joinedCommunities.filter(c => c !== community);
        await user.save();

        // Update Community document
        const comm = await Community.findOne({ community });
        if (comm) {
            comm.members = comm.members.filter(m => m !== username);
            await comm.save();
        }

        res.json({ message: "Left community successfully" });
    } catch (error) {
        console.error("Error leaving community:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/api/post/:id/react', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        const { emoji } = req.body;
        const username = req.session.username;

        // Check if user has already reacted with this emoji
        const hasReacted = post.reactions[emoji].users.includes(username);

        if (hasReacted) {
            // Remove reaction
            post.reactions[emoji].users = post.reactions[emoji].users.filter(user => user !== username);
            post.reactions[emoji].count--;
        } else {
            // Add reaction
            post.reactions[emoji].users.push(username);
            post.reactions[emoji].count++;
        }

        await post.save();
        res.json(post);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get posts created by the current user
app.get('/api/user/posts', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    try {
        const username = req.session.username;
        const posts = await Post.find({ username });
        res.json(posts);
    } catch (error) {
        console.error('Error fetching user posts:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Search posts by text in title or brief
app.get('/api/search-posts', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    try {
        const { query } = req.query;
        const username = req.session.username;
        const user = await User.findOne({ username });

        if (!user || !Array.isArray(user.joinedCommunities)) {
            return res.json([]);
        }

        // Search for posts in user's communities that match the query in title or brief
        const posts = await Post.find({
            community: { $in: user.joinedCommunities },
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { brief: { $regex: query, $options: 'i' } }
            ]
        });

        res.json(posts || []);
    } catch (error) {
        console.error('Error searching posts:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get notifications for the current user
app.get('/api/notifications', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    try {
        const username = req.session.username;
        
        // Find all posts created by the current user
        const userPosts = await Post.find({ username });
        
        if (!userPosts || userPosts.length === 0) {
            return res.json([]);
        }
        
        // Collect all interactions (reactions and comments) from these posts
        const notifications = [];
        
        userPosts.forEach(post => {
            // Process comments
            if (post.comments && post.comments.length > 0) {
                post.comments.forEach(comment => {
                    notifications.push({
                        type: 'comment',
                        postId: post._id,
                        postTitle: post.title,
                        postBrief: post.brief,
                        username: comment.username,
                        content: comment.content,
                        createdAt: comment.createdAt
                    });
                });
            }
            
            // Process reactions
            Object.entries(post.reactions).forEach(([emoji, data]) => {
                if (data.users && data.users.length > 0) {
                    data.users.forEach(user => {
                        notifications.push({
                            type: 'reaction',
                            postId: post._id,
                            postTitle: post.title,
                            postBrief: post.brief,
                            username: user,
                            emoji: emoji,
                            createdAt: post.createdAt // Using post creation date as we don't store reaction dates
                        });
                    });
                }
            });
        });
        
        // Sort notifications by date (newest first)
        notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
