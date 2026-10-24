import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from './models/User.js';
import { Exam } from './models/Exam.js';
import { AuthEvent } from './models/AuthEvent.js';
import { appendAudit } from './services/auditChain.js';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
  console.error('Refusing to seed in production: it deletes all users and creates demo accounts with public passwords.\nUse "npm run create-admin" to create your real administrator instead.');
  process.exit(1);
}

const gauss = (m, s) => { const u = 1 - Math.random(), v = Math.random(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (x) => Math.min(1, Math.max(0, x));

console.warn('DEMO SEED: creates users with PUBLIC passwords. Local testing only.');
await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bioguard');
await Promise.all([User.deleteMany({}), Exam.deleteMany({}), AuthEvent.deleteMany({ synthetic: true })]);

const admin = await User.create({ name: 'Asha Admin', email: 'admin@bioguard.dev', password: 'Admin@123', role: 'admin' });
await User.create({ name: 'Dr. Karthik Faculty', email: 'faculty@bioguard.dev', password: 'Faculty@123', role: 'faculty', department: 'CSE' });
const student = await User.create({ name: 'Priya Student', email: 'student@bioguard.dev', password: 'Student@123', role: 'student', rollNo: '21CS042', department: 'CSE' });

await Exam.create({
  title: 'Computer Networks - Unit Test 1', description: 'Basics of layered architecture, TCP/IP and network security.',
  durationMin: 15, heartbeatSec: 30, createdBy: admin._id,
  questions: [
    { text: 'Which layer of the OSI model is responsible for end-to-end delivery and reliability?', options: ['Network', 'Transport', 'Session', 'Data link'], answerIndex: 1 },
    { text: 'Which protocol resolves an IP address to a MAC address on a LAN?', options: ['DNS', 'DHCP', 'ARP', 'ICMP'], answerIndex: 2 },
    { text: 'TLS primarily provides which combination?', options: ['Compression and routing', 'Confidentiality and integrity', 'Addressing and NAT', 'Load balancing'], answerIndex: 1 },
    { text: 'In biometrics, FAR stands for:', options: ['False Accept Rate', 'Fast Access Ratio', 'Final Authentication Result', 'Face Alignment Rate'], answerIndex: 0 },
    { text: 'Score-level fusion combines:', options: ['Raw sensor images', 'Feature vectors only', 'Matching scores of modalities', 'Passwords and hashes'], answerIndex: 2 },
  ],
});

await Exam.create({
  title: 'Biometrics and Security - Quick Quiz', description: 'Ten-minute check on authentication concepts.',
  durationMin: 10, heartbeatSec: 30, createdBy: admin._id,
  questions: [
    { text: 'Which is a behavioural biometric?', options: ['Iris pattern', 'Keystroke dynamics', 'Fingerprint', 'Face geometry'], answerIndex: 1 },
    { text: 'Liveness detection mainly defends against:', options: ['SQL injection', 'Presentation attacks (photo/video)', 'DDoS', 'Phishing emails'], answerIndex: 1 },
    { text: 'EER is the point where:', options: ['FAR equals FRR', 'FAR is zero', 'FRR is zero', 'Accuracy is 100%'], answerIndex: 0 },
    { text: 'Raising the accept threshold usually:', options: ['Lowers FRR', 'Lowers FAR and raises FRR', 'Has no effect', 'Lowers both'], answerIndex: 1 },
  ],
});

// Synthetic labelled scores so the FAR/FRR/EER dashboard has data from day one (clearly marked synthetic)
const docs = [];
for (let i = 0; i < 300; i++) {
  const f = clamp(gauss(0.86, 0.1)), k = clamp(gauss(0.78, 0.14));
  docs.push({ user: student._id, mode: 'test', label: 'genuine', faceScore: f, keyScore: k, fused: clamp(0.55 * f + 0.45 * k), decision: 'ACCEPT', synthetic: true });
  const f2 = clamp(gauss(0.24, 0.16)), k2 = clamp(gauss(0.33, 0.2));
  docs.push({ user: student._id, mode: 'test', label: 'impostor', faceScore: f2, keyScore: k2, fused: clamp(0.55 * f2 + 0.45 * k2), decision: 'REJECT', synthetic: true });
}
await AuthEvent.insertMany(docs);
await appendAudit('SEED', { note: 'Demo data created' });
console.log('Seeded.\n  admin@bioguard.dev / Admin@123\n  faculty@bioguard.dev / Faculty@123\n  student@bioguard.dev / Student@123');
await mongoose.disconnect();
