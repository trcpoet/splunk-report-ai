import { Schema, model, models, type Model } from 'mongoose';

// Saved embeddings (vectors) of the searches Write SPL compares requests with
// (lib/spl-examples.ts), so each text is sent to the AI only once. _id is a
// hash of the model, the vector size, the purpose and the text, so a changed
// text or another model gets a new vector. MongoDB deletes them after 90 days.

export interface IAiEmbedding {
    _id: string;
    vector: number[];
    model: string;
    createdAt: Date;
}

const AiEmbeddingSchema = new Schema<IAiEmbedding>(
    {
        _id: { type: String, required: true },
        vector: { type: [Number], required: true },
        model: String,
        createdAt: { type: Date, default: Date.now },
    },
    { collection: 'ai_embeddings', versionKey: false },
);

AiEmbeddingSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86_400 });

const AiEmbedding = (models.AiEmbedding as Model<IAiEmbedding>) || model<IAiEmbedding>('AiEmbedding', AiEmbeddingSchema);

export default AiEmbedding;
