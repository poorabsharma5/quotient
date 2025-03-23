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
    cookie: { secure: false }
}));

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Connected to MongoDB Atlas"))
    .catch(err => console.error("MongoDB connection error:", err));

const db = mongoose.connection;
db.once("open", () => console.log("Connected to MongoDB"));

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
    reactions: {
        "👍": { type: Number, default: 0 },
        "😂": { type: Number, default: 0 },
        "😢": { type: Number, default: 0 },
        "🔥": { type: Number, default: 0 },
        "🙏": { type: Number, default: 0 }
    }
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

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
