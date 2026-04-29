const mongoose = require('mongoose');

const LessonSchema = new mongoose.Schema({
    id: { type: String, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['video', 'file', 'quiz', 'link'], default: 'video' },
    content: { type: String }, // URL or text
    isVisible: { type: Boolean, default: true },
    orderIndex: { type: Number, default: 0 },
    quizZone: { type: mongoose.Schema.Types.Mixed },
    gameZone: { type: mongoose.Schema.Types.Mixed }
});

const UnitSchema = new mongoose.Schema({
    id: { type: String, required: true },
    title: { type: String, required: true },
    orderIndex: { type: Number, default: 0 },
    lessons: [LessonSchema]
});

const CourseSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    term: { type: String, enum: ['term1', 'term2'], required: true },
    units: [UnitSchema]
});

const GroupSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    tenantId: { type: String, required: true, index: true },
    courses: [CourseSchema]
});

const ClassSchema = new mongoose.Schema({
    id: { type: String, required: true, index: true },
    name: { type: String, required: true },
    tenantId: { type: String, required: true, index: true },
    groups: [GroupSchema]
});

module.exports = {
    Class: mongoose.model('Class', ClassSchema),
    Group: mongoose.model('Group', GroupSchema) // If we want even more granular
};
