import express from 'express';
import {
  generateCertificate,
  getStudentCertificates,
  getCertificate,
  verifyCertificate,
  downloadCertificate,
  getAllCertificates,
  revokeCertificate,
  getCertificateAnalytics
} from '../controllers/certificateController.js';

const router = express.Router();

// Public routes
router.get('/verify/:verificationCode', verifyCertificate);

// Protected routes (require authentication)
// Student/User routes
router.get('/my-certificates', getStudentCertificates);
router.get('/student/:studentId', getStudentCertificates);
router.get('/:certificateId', getCertificate);
router.get('/:certificateId/download', downloadCertificate);

// Instructor/Admin routes
router.post('/generate', generateCertificate);
router.get('/', getAllCertificates);
router.put('/:certificateId/revoke', revokeCertificate);
router.get('/analytics/overview', getCertificateAnalytics);

export default router;
