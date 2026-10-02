import { Router } from 'express';

import { avatarUpload } from '../config/multerConfig.js';
import {
  getUserProfile,
  listProfiles,
  saveProfile,
  uploadAvatar,
  removeAvatar,
} from '../controllers/profileController.js';

const router = Router();

// ── Profile reads ────────────────────────────────────────────────────────
router.get('/users/profiles', listProfiles);
router.get('/users/:userId/profile', getUserProfile);

// ── Profile writes ───────────────────────────────────────────────────────
router.post('/user/profile', saveProfile);
router.patch('/user/profile', saveProfile);

// Single-image upload; `avatar.single()` matches the frontend form field.
router.post('/user/avatar', avatarUpload.single('avatar'), uploadAvatar);
router.post('/users/:userId/avatar', avatarUpload.single('avatar'), uploadAvatar);

router.delete('/user/avatar', removeAvatar);

export default router;