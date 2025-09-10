import Payment from "../models/payment.js";
import Course from "../models/course.js";
import User from "../models/user.js";
import jwt from "jsonwebtoken";

// Helper function to get user from token
const getUserFromRequest = async (req) => {
  let user = null;
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const JWT_SECRET = process.env.JWT_SECRET ;
      const decoded = jwt.verify(token, JWT_SECRET);
      user = await User.findById(decoded.userId);
    } catch (error) {
      console.log('JWT verification failed:', error.message);
    }
  }
  return user;
};

// ==================== PAYMENT PROCESSING ====================

// Initiate payment for paid courses
export const initiatePayment = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { courseId, paymentMethod, billingAddress, couponCode } = req.body;

    // Get course details
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if course is free
    if (course.pricing.type === 'free' || course.pricing.amount === 0) {
      return res.status(400).json({ 
        error: 'Payment not required for free courses',
        message: 'This course is free. You can enroll directly without payment.'
      });
    }

    // Check if user is already enrolled
    const isAlreadyEnrolled = course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === user._id.toString()
    );
    
    if (isAlreadyEnrolled) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }

    // Calculate payment amount
    let originalAmount = course.pricing.amount;
    let discountAmount = 0;
    let finalAmount = originalAmount;

    // Apply course discount if available
    if (course.pricing.discount && course.pricing.discount.percentage > 0) {
      const currentDate = new Date();
      if (!course.pricing.discount.validUntil || new Date(course.pricing.discount.validUntil) > currentDate) {
        discountAmount = (originalAmount * course.pricing.discount.percentage) / 100;
        finalAmount = originalAmount - discountAmount;
      }
    }

    // Apply coupon code if provided
    let couponDiscount = null;
    if (couponCode) {
      // TODO: Implement coupon validation logic
      // For now, we'll skip coupon validation
    }

    // Create payment record
    const payment = new Payment({
      paymentId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Ensure paymentId is always set
      user: user._id,
      course: courseId,
      amount: {
        original: originalAmount,
        discount: discountAmount,
        final: finalAmount,
        currency: course.pricing.currency || 'USD'
      },
      gateway: {
        provider: paymentMethod.provider || 'stripe'
      },
      paymentMethod: {
        type: paymentMethod.type,
        details: {
          ...paymentMethod.details,
          billingAddress
        }
      },
      status: 'pending',
      description: `Payment for course: ${course.title}`,
      ...(couponCode && { 
        discount: { 
          couponCode,
          discountType: 'percentage',
          discountValue: 0,
          appliedAt: new Date()
        }
      })
    });

    await payment.save();

    res.status(201).json({
      message: 'Payment initiated successfully',
      payment: {
        paymentId: payment.paymentId,
        amount: payment.amount,
        status: payment.status,
        paymentMethod: payment.paymentMethod,
        course: {
          id: course._id,
          title: course.title,
          price: course.pricing.amount
        }
      },
      nextStep: 'Process payment with gateway'
    });

  } catch (error) {
    console.error('Error initiating payment:', error);
    res.status(500).json({ 
      error: 'Failed to initiate payment',
      details: error.message 
    });
  }
};

// Process payment (simulate gateway processing)
export const processPayment = async (req, res) => {
  try {
    const { paymentId, gatewayResponse } = req.body;

    const payment = await Payment.findOne({ paymentId })
      .populate('user', 'firstName lastName email')
      .populate('course', 'title pricing');

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({ error: 'Payment already processed' });
    }

    // Simulate payment processing based on gateway
    const isPaymentSuccessful = gatewayResponse.status === 'success';

    if (isPaymentSuccessful) {
      // Mark payment as completed
      payment.status = 'completed';
      payment.completedAt = new Date();
      payment.gateway.gatewayTransactionId = gatewayResponse.transactionId;
      payment.gateway.gatewayResponse = gatewayResponse;

      await payment.save();

      // Enroll user in course
      const course = await Course.findById(payment.course._id);
      course.enrolledStudents.push({
        student: payment.user._id,
        enrolledAt: new Date(),
        progress: 0,
        completed: false
      });

      // Update course statistics
      course.stats.totalEnrollments += 1;
      course.stats.activeStudents += 1;

      await course.save();

      // Update user's enrolled courses
      const user = await User.findById(payment.user._id);
      user.enrolledCourses.push({
        courseId: course._id,
        enrollmentDate: new Date(),
        progress: 0,
        completed: false
      });

      await user.save();

      res.status(200).json({
        message: 'Payment completed successfully',
        payment: {
          paymentId: payment.paymentId,
          status: payment.status,
          amount: payment.amount,
          completedAt: payment.completedAt
        },
        enrollment: {
          courseId: course._id,
          courseTitle: course.title,
          enrolledAt: new Date()
        }
      });

    } else {
      // Mark payment as failed
      payment.status = 'failed';
      payment.failedAt = new Date();
      payment.gateway.gatewayResponse = gatewayResponse;
      payment.notes = gatewayResponse.errorMessage || 'Payment failed';

      await payment.save();

      res.status(400).json({
        error: 'Payment failed',
        payment: {
          paymentId: payment.paymentId,
          status: payment.status,
          failureReason: payment.notes
        }
      });
    }

  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ 
      error: 'Failed to process payment',
      details: error.message 
    });
  }
};

// Enroll in free course (no payment required)
export const enrollInFreeCourse = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { courseId } = req.body;

    // Get course details
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if course is free
    if (course.pricing.type !== 'free' && course.pricing.amount > 0) {
      return res.status(400).json({ 
        error: 'Payment required for paid courses',
        message: 'This course requires payment. Please use the payment endpoint.'
      });
    }

    // Check if user is already enrolled
    const isAlreadyEnrolled = course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === user._id.toString()
    );
    
    if (isAlreadyEnrolled) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }

    // Create a free payment record for tracking
    const payment = new Payment({
      paymentId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Ensure paymentId is always set
      user: user._id,
      course: courseId,
      amount: {
        original: 0,
        discount: 0,
        final: 0,
        currency: 'USD'
      },
      gateway: {
        provider: 'free'
      },
      paymentMethod: {
        type: 'free'
      },
      status: 'completed',
      completedAt: new Date(),
      description: `Free enrollment for course: ${course.title}`
    });

    await payment.save();

    // Enroll user in course
    course.enrolledStudents.push({
      student: user._id,
      enrolledAt: new Date(),
      progress: 0,
      completed: false
    });

    // Update course statistics
    course.stats.totalEnrollments += 1;
    course.stats.activeStudents += 1;

    await course.save();

    // Update user's enrolled courses
    user.enrolledCourses.push({
      courseId: course._id,
      enrollmentDate: new Date(),
      progress: 0,
      completed: false
    });

    await user.save();

    res.status(200).json({
      message: 'Successfully enrolled in free course',
      enrollment: {
        courseId: course._id,
        courseTitle: course.title,
        enrolledAt: new Date(),
        paymentId: payment.paymentId
      }
    });

  } catch (error) {
    console.error('Error enrolling in free course:', error);
    res.status(500).json({ 
      error: 'Failed to enroll in course',
      details: error.message 
    });
  }
};

// ==================== PAYMENT MANAGEMENT ====================

// Get payment history for user
export const getPaymentHistory = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { page = 1, limit = 10, status } = req.query;

    let filter = { user: user._id };
    if (status) {
      filter.status = status;
    }

    const payments = await Payment.find(filter)
      .populate('course', 'title pricing')
      .sort({ paymentDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payment.countDocuments(filter);

    res.status(200).json({
      message: 'Payment history retrieved successfully',
      payments: payments.map(payment => ({
        paymentId: payment.paymentId,
        course: payment.course,
        amount: payment.amount,
        status: payment.status,
        paymentMethod: payment.paymentMethod.type,
        paymentDate: payment.paymentDate,
        completedAt: payment.completedAt,
        invoice: payment.invoice
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment history',
      details: error.message 
    });
  }
};

// Get payment details
export const getPaymentDetails = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { paymentId } = req.params;

    const payment = await Payment.findOne({ 
      paymentId, 
      user: user._id 
    }).populate('course', 'title description pricing instructor');

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.status(200).json({
      message: 'Payment details retrieved successfully',
      payment: {
        paymentId: payment.paymentId,
        transactionId: payment.transactionId,
        course: payment.course,
        amount: payment.amount,
        status: payment.status,
        paymentMethod: payment.paymentMethod,
        paymentDate: payment.paymentDate,
        completedAt: payment.completedAt,
        invoice: payment.invoice,
        refund: payment.refund,
        description: payment.description
      }
    });

  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment details',
      details: error.message 
    });
  }
};

// Request refund
export const requestRefund = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { paymentId } = req.params;
    const { reason } = req.body;

    const payment = await Payment.findOne({ 
      paymentId, 
      user: user._id 
    }).populate('course', 'title');

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({ error: 'Can only refund completed payments' });
    }

    if (payment.refund.isRefunded) {
      return res.status(400).json({ error: 'Payment already refunded' });
    }

    // Add refund request to notes
    payment.notes = payment.notes ? 
      `${payment.notes}\nRefund requested: ${reason}` : 
      `Refund requested: ${reason}`;
    
    payment.status = 'pending'; // Change to pending for admin review
    
    await payment.save();

    res.status(200).json({
      message: 'Refund request submitted successfully',
      payment: {
        paymentId: payment.paymentId,
        status: payment.status,
        refundReason: reason
      }
    });

  } catch (error) {
    console.error('Error requesting refund:', error);
    res.status(500).json({ 
      error: 'Failed to request refund',
      details: error.message 
    });
  }
};

// ==================== ADMIN FUNCTIONS ====================

// Get all payments (Admin only)
export const getAllPayments = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 20, status, courseId, userId } = req.query;

    let filter = {};
    if (status) filter.status = status;
    if (courseId) filter.course = courseId;
    if (userId) filter.user = userId;

    const payments = await Payment.find(filter)
      .populate('user', 'firstName lastName email')
      .populate('course', 'title pricing')
      .sort({ paymentDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payment.countDocuments(filter);

    res.status(200).json({
      message: 'Payments retrieved successfully',
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching all payments:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payments',
      details: error.message 
    });
  }
};

// Process refund (Admin only)
export const processRefund = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { paymentId } = req.params;
    const { refundAmount, reason } = req.body;

    const payment = await Payment.findOne({ paymentId })
      .populate('user', 'firstName lastName email')
      .populate('course', 'title');

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({ error: 'Can only refund completed payments' });
    }

    const amount = refundAmount || payment.amount.final;
    await payment.processRefund(amount, reason, user._id);

    res.status(200).json({
      message: 'Refund processed successfully',
      payment: {
        paymentId: payment.paymentId,
        status: payment.status,
        refundAmount: amount,
        refundReason: reason
      }
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ 
      error: 'Failed to process refund',
      details: error.message 
    });
  }
};

export default {
  initiatePayment,
  processPayment,
  enrollInFreeCourse,
  getPaymentHistory,
  getPaymentDetails,
  requestRefund,
  getAllPayments,
  processRefund
};
