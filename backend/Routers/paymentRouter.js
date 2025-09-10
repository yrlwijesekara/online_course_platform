import express from 'express';
import {
  initiatePayment,
  processPayment,
  enrollInFreeCourse,
  getPaymentHistory,
  getPaymentDetails,
  requestRefund,
  getAllPayments,
  processRefund
} from '../controllers/paymentController.js';

const router = express.Router();

// ==================== PAYMENT PROCESSING ====================

// Initiate payment for paid courses
router.post('/initiate', initiatePayment);

// Process payment with gateway response
router.post('/process', processPayment);

// Enroll in free course (no payment required)
router.post('/enroll-free', enrollInFreeCourse);

// ==================== PAYMENT MANAGEMENT ====================

// Get user's payment history
router.get('/history', getPaymentHistory);

// Get specific payment details
router.get('/:paymentId', getPaymentDetails);

// Request refund for a payment
router.post('/:paymentId/refund-request', requestRefund);

// ==================== ADMIN ROUTES ====================

// Get all payments (Admin only)
router.get('/admin/all', getAllPayments);

// Process refund (Admin only)
router.post('/admin/:paymentId/refund', processRefund);

export default router;
