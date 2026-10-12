import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; poId: string }> }
) {
  try {
    const body = await request.json();
    const { email, vendorName, materialName, poLink } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Vendor email is required' },
        { status: 400 }
      );
    }

    // Configure the SMTP transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Construct the email payload
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Purchase Order Awarded: ${materialName}`,
      text: `Hello ${vendorName},\n\nWe are pleased to inform you that you have been awarded the Purchase Order for ${materialName}.\n\nPlease review your PO details here:\n${poLink}\n\nThank you.`,
    };

    // Send the email
    await transporter.sendMail(mailOptions);

    return NextResponse.json(
      { success: true, message: 'Award email sent successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to send award email:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send award email' },
      { status: 500 }
    );
  }
}
