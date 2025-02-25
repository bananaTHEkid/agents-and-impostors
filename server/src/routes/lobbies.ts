import { Router, Request, Response } from "express";
import db from "../db/db";

const router = Router();

// Get all messages
router.get("/", (req: Request, res: Response) => {
    res.send("Welcome to the homepage");
});

// Delete all messages
router.delete("/", (req: Request, res: Response) => {
    db.run("DELETE FROM messages", function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "All messages deleted" });
    });
});

export default router;
