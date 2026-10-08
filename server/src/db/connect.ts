import mongoose from 'mongoose';

export async function connectDb(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  // Build unique/TTL indexes before serving requests so duplicate checks are reliable.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
