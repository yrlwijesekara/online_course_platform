import User from "../models/user.js";

export function createUser(req, res) {
  const newUser = new User(req.body);
  newUser.save()
    .then(() => res.status(201).json({ message: 'User created successfully', user: newUser }))
    .catch(() => res.status(400).json({ error: 'Failed to create user' }));
}
