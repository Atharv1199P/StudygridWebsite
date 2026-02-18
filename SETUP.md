# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Supabase

1. Create a Supabase project at https://supabase.com/
2. Enable Authentication (Email/Password)
3. Create tables for your database (users, study_groups, messages, files)
4. Enable Storage for file uploads
5. Copy your Supabase project URL and anon key

## Step 3: Get OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key

## Step 4: Create .env File

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

VITE_OPENAI_API_KEY=your_openai_key_here
```

## Step 5: Configure Supabase Tables and Policies

In Supabase Console > SQL Editor, run the following to create tables:

```sql
-- Create users table (extends Supabase auth)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create study_groups table
CREATE TABLE public.study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  teacher_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create group_members table
CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id),
  user_id UUID NOT NULL REFERENCES public.users(id),
  joined_at TIMESTAMP DEFAULT NOW()
);

-- Create messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id),
  user_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create files table
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id),
  user_id UUID NOT NULL REFERENCES public.users(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read their own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Study groups policies
CREATE POLICY "Anyone can read study groups" ON public.study_groups
  FOR SELECT USING (true);

CREATE POLICY "Teachers can create study groups" ON public.study_groups
  FOR INSERT WITH CHECK (auth.uid() = teacher_id);

-- Group members policies
CREATE POLICY "Members can read group members" ON public.group_members
  FOR SELECT USING (true);

-- Messages policies
CREATE POLICY "Authenticated users can read messages" ON public.messages
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create messages" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Files policies
CREATE POLICY "Authenticated users can read files" ON public.files
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload files" ON public.files
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

## Step 6: Configure Supabase Storage

In Supabase Console > Storage:

1. Create a new bucket named `study-materials`
2. Make it public
3. Add the following policies:

```sql
-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'study-materials' AND auth.role() = 'authenticated');

-- Allow authenticated users to view files
CREATE POLICY "Authenticated users can view" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'study-materials' AND auth.role() = 'authenticated');

-- Allow users to delete their own files
CREATE POLICY "Users can delete own files" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'study-materials' AND auth.uid() = owner);
```

## Step 7: Run the Project

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

## Step 8: Test the Application

1. Register as a Teacher
2. Create a study group
3. Note the Group ID (shown in the URL)
4. Register as a Student (or use another browser/incognito)
5. Join the group using the Group ID
6. Upload a file
7. Test AI features

## Troubleshooting

- **Firebase errors**: Check that all env variables are correct
- **OpenAI errors**: Verify API key and account credits
- **Build errors**: Delete node_modules and reinstall

