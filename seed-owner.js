/**
 * ============================================================
 *  Numi Platform — Platform Owner Account Seeder
 *  File: backend/seed-owner.js
 *
 *  Run once to create/update the platform owner account.
 *  Usage: node backend/seed-owner.js
 * ============================================================
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/numi_local_db';

// ─── Platform Owner Definition ────────────────────────────────────────────────
const OWNER = {
    id:       'super-admin-numi-owner',
    name:     'سيد حمدي',
    phone:    '01110154093',
    password: '01110154093',        // Default password = phone number (change after first login)
    role:     'super_admin',
    status:   'active',
    tenantId: 'global',
    permissions: {
        isOwner:                  true,
        isSuperAdmin:             true,
        view_students:            true,
        add_student:              true,
        edit_student:             true,
        delete_student:           true,
        reset_quiz:               true,
        view_structure:           true,
        manage_structure:         true,
        manage_lessons:           true,
        manage_all_groups:        true,
        view_live:                true,
        manage_live:              true,
        view_chat:                true,
        send_chat:                true,
        view_qbank:               true,
        manage_qbank:             true,
        generate_ai:              true,
        view_games:               true,
        manage_games:             true,
        view_teacher_platforms:   true,
        manage_teacher_platforms: true,
        view_dashboard:           true,
        view_reports:             true,
        manage_teachers:          true,
        manage_admins:            true,
        manage_platform:          true,
        take_quiz:                true,
        view_lesson:              true,
        use_ai_chat:              true
    }
};

// ─── Schema (minimal, matches server.js) ─────────────────────────────────────
const UserSchema = new mongoose.Schema({
    id:          { type: String, unique: true, required: true },
    name:        { type: String, required: true },
    phone:       { type: String, unique: true, required: true },
    password:    { type: String, default: '' },
    role:        { type: String, default: 'student' },
    tenantId:    { type: String, default: 'main' },
    status:      { type: String, default: 'inactive' },
    permissions: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { strict: false, timestamps: true });

const User = mongoose.model('User', UserSchema);

// ─── Run ──────────────────────────────────────────────────────────────────────
async function seed() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║       NUMI PLATFORM — OWNER ACCOUNT SEEDER      ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    try {
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 20000,
            tlsAllowInvalidCertificates: true
        });
        console.log('✅ Connected to MongoDB\n');

        const existing = await User.findOne({ phone: OWNER.phone });

        if (existing) {
            // Update to ensure super_admin role and all permissions
            await User.findOneAndUpdate(
                { phone: OWNER.phone },
                {
                    role:        OWNER.role,
                    status:      OWNER.status,
                    permissions: OWNER.permissions,
                    tenantId:    OWNER.tenantId,
                    name:        OWNER.name
                },
                { new: true }
            );
            console.log(`✅ Platform owner account UPDATED.`);
        } else {
            // Create fresh account
            const owner = new User(OWNER);
            await owner.save();
            console.log(`✅ Platform owner account CREATED.`);
        }

        console.log('\n── Owner Account Details ──────────────────────────');
        console.log(`  Name:     ${OWNER.name}`);
        console.log(`  Phone:    ${OWNER.phone}`);
        console.log(`  Password: ${OWNER.password}`);
        console.log(`  Role:     ${OWNER.role}`);
        console.log(`  Status:   ${OWNER.status}`);
        console.log('\n👑 Platform owner is ready. Login at the admin dashboard.');
        console.log('⚠️  Change the default password after first login!\n');

    } catch (err) {
        console.error('❌ Seed failed:', err.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

seed();
