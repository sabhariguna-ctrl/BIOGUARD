
import 'dotenv/config';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';

import { User } from '../src/models/User.js';
import { ensureAdmin } from '../src/services/bootstrap.js';

process.env.ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || 'owner@college.edu';

if (!process.env.MONGO_URI) {
  throw new Error('MONGO_URI must be configured for bootstrap tests.');
}

await mongoose.connect(process.env.MONGO_URI);

await User.deleteMany({});

let pass = 0;

const ok = (condition, message) => {
  assert.ok(condition, message);
  pass++;
  console.log('  ok  ', message);
};

// 1. Create the configured administrator.
let notes = await ensureAdmin();

let admin = await User.findOne({
  email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
});

ok(
  admin?.role === 'admin' && admin.emailVerified === true,
  'admin is created from ADMIN_EMAIL, verified'
);

ok(
  notes.some((note) => /Administrator account created/.test(note)),
  'reports what it did'
);

// 2. A second startup must not change admin state or report admin changes.
// A legitimate warning about other demo accounts is allowed.
notes = await ensureAdmin();

ok(
  !notes.some((note) =>
    /Administrator account created|is now the administrator|Demoted to faculty/.test(
      note
    )
  ),
  'second start changes nothing (idempotent)'
);

// 3. Test an existing account that registered using ADMIN_EMAIL.
await User.deleteMany({});

const squatter = await User.create({
  name: 'Squatter',
  email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
  password: 'Attacker123',
  role: 'student',
  emailVerified: false,
});

await ensureAdmin();

const taken = await User.findById(squatter._id).select('+password');

ok(
  taken.role === 'admin' && taken.emailVerified === true,
  'a self-registered account with the admin email becomes the admin'
);

ok(
  !(await taken.compare('Attacker123')),
  'the squatter password no longer works'
);

ok(
  taken.tokenVersion >= 1,
  'existing sessions are revoked'
);

// 4. Other administrators must be demoted.
await User.create({
  name: 'Old Admin',
  email: 'old@college.edu',
  password: 'OldAdmin123',
  role: 'admin',
});

notes = await ensureAdmin();

ok(
  (await User.findOne({ email: 'old@college.edu' })).role === 'faculty',
  'any other admin is demoted to faculty'
);

ok(
  notes.some((note) => /Demoted/.test(note)),
  'demotion is reported'
);

ok(
  (await User.countDocuments({ role: 'admin' })) === 1,
  'exactly one admin remains'
);

// Cleanup test records.
await User.deleteMany({});

console.log(`\n${pass} passed`);

await mongoose.disconnect();
