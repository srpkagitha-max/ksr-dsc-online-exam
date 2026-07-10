# KSR Daily Tests v5 Premium Stable Candidate

## New in v5
- Institute logo and institute master
- Batch master and batch-wise student master
- Student-name mapped unique codes
- Codes PDF: S.No, Name, Exam Code, Signature
- Batch-wise live monitor
- WhatsApp share message
- Draft auto-recovery
- Direct Exam ID / Exam Code document lookup (fewer Firestore reads)
- Compact student exam progress bar and question jump
- Premium DSC-style answer sheet PDF
- Results with batch column and no phone number

## Important setup
After uploading all files to GitHub, publish the included `firestore.rules` in Firebase Console → Firestore Database → Rules.

## First use order
1. Admin Login
2. Institute & Batches
3. Add Institute, Batch, Students
4. Dashboard → Create Exam → Generate Codes
5. Download codes PDF / Share WhatsApp
6. Live Monitor → enter Exam ID
