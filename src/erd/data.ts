export type Cardinality = "1:1" | "1:M" | "M:N";

export interface ErdField {
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
  refTable?: string;
  refField?: string;
  nullable?: boolean;
}

export interface ErdTable {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  fields: ErdField[];
  description: string;
}

export interface ErdRelationship {
  id: string;
  fromTable: string;
  fromField: string;
  toTable: string;
  toField: string;
  cardinality: Cardinality;
  label: string;
  plainEnglish: string;
}

export interface SampleSchema {
  tables: ErdTable[];
  relationships: ErdRelationship[];
}

export const SAMPLE_SCHEMA: SampleSchema = {
  tables: [
    {
      id: "users",
      name: "users",
      x: 60,
      y: 80,
      width: 240,
      description: "People who have an account on the platform.",
      fields: [
        { name: "id", type: "uuid", pk: true, nullable: false },
        { name: "email", type: "text", nullable: false },
        { name: "name", type: "text", nullable: true },
        { name: "created_at", type: "timestamp", nullable: false },
      ],
    },
    {
      id: "profiles",
      name: "profiles",
      x: 400,
      y: 60,
      width: 240,
      description: "Extended profile details for a single user.",
      fields: [
        { name: "id", type: "uuid", pk: true, nullable: false },
        {
          name: "user_id",
          type: "uuid",
          fk: true,
          refTable: "users",
          refField: "id",
          nullable: false,
        },
        { name: "bio", type: "text", nullable: true },
        { name: "avatar_url", type: "text", nullable: true },
      ],
    },
    {
      id: "posts",
      name: "posts",
      x: 400,
      y: 320,
      width: 240,
      description: "Articles written by an author.",
      fields: [
        { name: "id", type: "uuid", pk: true, nullable: false },
        {
          name: "author_id",
          type: "uuid",
          fk: true,
          refTable: "users",
          refField: "id",
          nullable: false,
        },
        { name: "title", type: "text", nullable: false },
        { name: "body", type: "text", nullable: true },
        { name: "published_at", type: "timestamp", nullable: true },
      ],
    },
    {
      id: "students",
      name: "students",
      x: 60,
      y: 420,
      width: 240,
      description: "Students enrolled at a school.",
      fields: [
        { name: "id", type: "uuid", pk: true, nullable: false },
        { name: "name", type: "text", nullable: false },
        { name: "grade", type: "int", nullable: true },
      ],
    },
    {
      id: "classes",
      name: "classes",
      x: 760,
      y: 420,
      width: 240,
      description: "Classes offered by the school.",
      fields: [
        { name: "id", type: "uuid", pk: true, nullable: false },
        { name: "title", type: "text", nullable: false },
        { name: "room", type: "text", nullable: true },
      ],
    },
    {
      id: "enrollments",
      name: "enrollments",
      x: 760,
      y: 60,
      width: 240,
      description: "Join table linking students to classes (many-to-many).",
      fields: [
        { name: "id", type: "uuid", pk: true, nullable: false },
        {
          name: "student_id",
          type: "uuid",
          fk: true,
          refTable: "students",
          refField: "id",
          nullable: false,
        },
        {
          name: "class_id",
          type: "uuid",
          fk: true,
          refTable: "classes",
          refField: "id",
          nullable: false,
        },
        { name: "enrolled_on", type: "date", nullable: false },
      ],
    },
  ],
  relationships: [
    {
      id: "users-profiles",
      fromTable: "users",
      fromField: "id",
      toTable: "profiles",
      toField: "user_id",
      cardinality: "1:1",
      label: "1:1 — One User to One Profile",
      plainEnglish:
        "Every user has exactly one profile, and every profile belongs to exactly one user. This is a one-to-one relationship. The profiles.user_id column is a foreign key pointing to users.id, and a unique constraint on profiles.user_id guarantees no two profiles can share the same user.",
    },
    {
      id: "users-posts",
      fromTable: "users",
      fromField: "id",
      toTable: "posts",
      toField: "author_id",
      cardinality: "1:M",
      label: "1:M — One User to Many Posts",
      plainEnglish:
        "One user (the author) can write many posts, but each post has exactly one author. This is a one-to-many relationship. The posts.author_id foreign key references users.id, so every post row remembers which user wrote it.",
    },
    {
      id: "students-enrollments",
      fromTable: "students",
      fromField: "id",
      toTable: "enrollments",
      toField: "student_id",
      cardinality: "1:M",
      label: "1:M — One Student to Many Enrollments",
      plainEnglish:
        "A student can enroll in many classes over time, producing many rows in the enrollments table. Each enrollment row belongs to exactly one student. This is the 'one' side of a many-to-many bridge.",
    },
    {
      id: "classes-enrollments",
      fromTable: "classes",
      fromField: "id",
      toTable: "enrollments",
      toField: "class_id",
      cardinality: "1:M",
      label: "1:M — One Class to Many Enrollments",
      plainEnglish:
        "A class can have many enrolled students, each represented by a row in enrollments. Each enrollment row points to exactly one class. Together with the student side, this forms a many-to-many relationship between students and classes.",
    },
    {
      id: "students-classes",
      fromTable: "students",
      fromField: "id",
      toTable: "classes",
      toField: "id",
      cardinality: "M:N",
      label: "M:N — Many Students to Many Classes",
      plainEnglish:
        "Many students can be enrolled in many classes, and each class can have many students. This many-to-many relationship is resolved through the enrollments join table, which holds one row per student-class pairing. You never connect students and classes directly — you always go through enrollments.",
    },
  ],
};

export const CARDINALITY_META: Record<
  Cardinality,
  {
    short: string;
    name: string;
    example: string;
    description: string;
    howToRead: string;
    symbol: string;
  }
> = {
  "1:1": {
    short: "1:1",
    name: "One-to-One",
    example: "User ↔ Profile",
    symbol: "━",
    description:
      "Each row in Table A matches exactly one row in Table B, and vice versa. It is the rarest relationship and is often used to split optional or sensitive data into its own table.",
    howToRead:
      "A unique foreign key on one side points to the primary key of the other. Add a UNIQUE constraint so only one match is ever allowed.",
  },
  "1:M": {
    short: "1:M",
    name: "One-to-Many",
    example: "Author → Posts",
    symbol: "┯",
    description:
      "One row in Table A can relate to many rows in Table B, but each row in Table B relates to only one row in Table A. This is the most common relationship in relational databases.",
    howToRead:
      "The 'many' side holds a foreign key pointing to the primary key of the 'one' side. No unique constraint — many rows can share the same parent.",
  },
  "M:N": {
    short: "M:N",
    name: "Many-to-Many",
    example: "Students ↔ Classes",
    symbol: "╳",
    description:
      "Rows in both tables can each relate to many rows in the other. Relational databases cannot store this directly, so it is resolved with a join table that holds two foreign keys.",
    howToRead:
      "Create a third 'join' table. Each row in it links one row from each side, carrying foreign keys to both parent tables.",
  },
};
