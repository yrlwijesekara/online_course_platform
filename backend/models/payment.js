import mongoose from "mongoose";

// Payment Transaction Schema
const paymentSchema = new mongoose.Schema({
  // Basic Payment Information
  paymentId: {
    type: String,
    required: [true, 'Payment ID is required'],
    unique: true,
    trim: true
  },
  transactionId: {
    type: String,
    unique: true,
    sparse: true // Allows null values but ensures uniqueness when present
  },
  
  // User and Course Information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course is required']
  },
  
  // Payment Details
  amount: {
    original: {
      type: Number,
      required: [true, 'Original amount is required'],
      min: [0, 'Amount cannot be negative']
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative']
    },
    final: {
      type: Number,
      required: [true, 'Final amount is required'],
      min: [0, 'Final amount cannot be negative']
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'USD',
      uppercase: true
    },
    tax: {
      amount: {
        type: Number,
        default: 0
      },
      rate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      }
    }
  },
  
  // Payment Gateway Information
  gateway: {
    provider: {
      type: String,
      required: [true, 'Payment provider is required'],
      enum: ['stripe', 'paypal', 'local', 'bank_transfer', 'credit_card', 'free']
    },
    gatewayTransactionId: String, // ID from payment gateway
    gatewayPaymentId: String, // Payment ID from gateway
    gatewayCustomerId: String, // Customer ID in gateway
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed // Store raw gateway response
    }
  },
  
  // Payment Status
  status: {
    type: String,
    required: [true, 'Payment status is required'],
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded'],
    default: 'pending'
  },
  
  // Payment Method
  paymentMethod: {
    type: {
      type: String,
      enum: ['credit_card', 'debit_card', 'paypal', 'bank_transfer', 'wallet', 'free'],
      required: [true, 'Payment method type is required']
    },
    details: {
      // For card payments
      cardLast4: String,
      cardBrand: String, // visa, mastercard, etc.
      cardExpiry: String,
      
      // For PayPal
      paypalEmail: String,
      paypalPayerId: String,
      
      // For bank transfer
      bankName: String,
      accountLast4: String,
      
      // General
      billingAddress: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String
      }
    }
  },
  
  // Discount Information
  discount: {
    couponCode: String,
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage'
    },
    discountValue: {
      type: Number,
      default: 0
    },
    appliedAt: Date
  },
  
  // Invoice Information
  invoice: {
    invoiceNumber: {
      type: String,
      unique: true,
      sparse: true
    },
    invoiceDate: {
      type: Date,
      default: Date.now
    },
    dueDate: Date,
    invoiceUrl: String, // URL to download invoice PDF
    isGenerated: {
      type: Boolean,
      default: false
    }
  },
  
  // Refund Information
  refund: {
    isRefunded: {
      type: Boolean,
      default: false
    },
    refundAmount: {
      type: Number,
      default: 0
    },
    refundDate: Date,
    refundReason: String,
    refundTransactionId: String,
    refundedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Timestamps
  paymentDate: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  failedAt: Date,
  
  // Additional Information
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  
  // Metadata for extensibility
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ course: 1, status: 1 });
// paymentId and transactionId indexes are created automatically due to unique: true
paymentSchema.index({ 'gateway.gatewayTransactionId': 1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ status: 1, paymentDate: -1 });

// Virtual for payment age
paymentSchema.virtual('paymentAge').get(function() {
  return Date.now() - this.paymentDate;
});

// Virtual for final amount with tax
paymentSchema.virtual('totalAmount').get(function() {
  return this.amount.final + this.amount.tax.amount;
});

// Method to mark payment as completed
paymentSchema.methods.markCompleted = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

// Method to mark payment as failed
paymentSchema.methods.markFailed = function(reason) {
  this.status = 'failed';
  this.failedAt = new Date();
  if (reason) {
    this.notes = this.notes ? `${this.notes}\nFailure reason: ${reason}` : `Failure reason: ${reason}`;
  }
  return this.save();
};

// Method to process refund
paymentSchema.methods.processRefund = function(amount, reason, refundedBy) {
  this.refund.isRefunded = true;
  this.refund.refundAmount = amount || this.amount.final;
  this.refund.refundDate = new Date();
  this.refund.refundReason = reason;
  this.refund.refundedBy = refundedBy;
  
  if (amount === this.amount.final) {
    this.status = 'refunded';
  } else {
    this.status = 'partially_refunded';
  }
  
  return this.save();
};

// Method to generate invoice number
paymentSchema.methods.generateInvoiceNumber = function() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  
  this.invoice.invoiceNumber = `INV-${year}${month}${day}-${random}`;
  this.invoice.isGenerated = true;
  return this.invoice.invoiceNumber;
};

// Static method to get payment statistics
paymentSchema.statics.getPaymentStats = function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount.final' },
        avgAmount: { $avg: '$amount.final' }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Static method to get revenue by period
paymentSchema.statics.getRevenueByPeriod = function(startDate, endDate, groupBy = 'day') {
  const groupFormat = {
    day: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } },
    month: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } },
    year: { $dateToString: { format: '%Y', date: '$paymentDate' } }
  };
  
  const pipeline = [
    {
      $match: {
        status: 'completed',
        paymentDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }
    },
    {
      $group: {
        _id: groupFormat[groupBy],
        revenue: { $sum: '$amount.final' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount.final' }
      }
    },
    { $sort: { _id: 1 } }
  ];
  
  return this.aggregate(pipeline);
};

// Pre-save middleware
paymentSchema.pre('save', function(next) {
  // Auto-generate payment ID if not provided
  if (!this.paymentId) {
    this.paymentId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Calculate final amount if not provided
  if (!this.amount.final) {
    this.amount.final = this.amount.original - this.amount.discount;
  }
  
  // Generate invoice number for completed payments
  if (this.status === 'completed' && !this.invoice.invoiceNumber) {
    this.generateInvoiceNumber();
  }
  
  next();
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
