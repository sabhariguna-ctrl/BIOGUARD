// Integration test for the ADMIN_EMAIL bootstrap. Run against a throwaway database:
//   MONGO_URI=mongodb://127.0.0.1:27017/bg_boot ADMIN_EMAIL=owner@college.edu node tests/bootstrap.mjs
import 'dotenv/config';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import { User } from '../src/models/User.js';
import { ensureAdmin } from '../src/services/bootstrap.js';

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'owner@college.edu';
await mongoose.connect(process.env.MONGO_URI);
await User.deleteMany({});
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ok  ', m); };

let notes = await ensureAdmin();
let admin = await User.findOne({ email: process.env.ADMIN_EMAIL });
ok(admin?.role === 'admin' && admin.emailVerified === true, 'admin is created from ADMIN_EMAIL, verified');

ok(notes.length >= 1, 'reports what it did');
notes = await ensureAdmin(); ok(notes.length === 0, 'second start changes nothing (idempotent)');

await User.deleteMany({});
const squatter = await User.create({ name: 'Squatter', email: process.env.ADMIN_EMAIL, password: 'Attacker123', role: 'student', emailVerified: false });
await ensureAdmin();
const taken = await User.findById(squatter._id).select('+password');
ok(taken.role === 'admin' && taken.emailVerified === true, 'a self-registered account with the admin email becomes the admin');
ok(!(await taken.compare('Attacker123')), 'the squatter password no longer works');
ok(taken.tokenVersion >= 1, 'existing sessions are revoked');

await User.create({ name: 'Old Admin', email: 'old@college.edu', password: 'OldAdmin123', role: 'admin' });
notes = await ensureAdmin();
ok((await User.findOne({ email: 'old@college.edu' })).role === 'faculty', 'any other admin is demoted to faculty');
ok(notes.some((n) => /Demoted/.test(n)), 'demotion is reported');
ok((await User.countDocuments({ role: 'admin' })) === 1, 'exactly one admin remains');
await User.deleteMany({});
console.log(`\n${pass} passed`);
await mongoose.disconnect();