import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1778505600000 implements MigrationInterface {
  name = 'InitialSchema1778505600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`CREATE TYPE "public"."users_locale_enum" AS ENUM('en', 'th')`);
    await queryRunner.query(
      `CREATE TYPE "public"."accounts_type_enum" AS ENUM('cash', 'bank', 'ewallet', 'credit_card', 'other')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."categories_kind_enum" AS ENUM('income', 'expense')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sessions_status_enum" AS ENUM('active', 'revoked', 'expired')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_type_enum" AS ENUM('income', 'expense')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "display_name" character varying(120) NOT NULL,
        "locale" "public"."users_locale_enum" NOT NULL DEFAULT 'en',
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "type" "public"."accounts_type_enum" NOT NULL,
        "currency_code" character varying(3) NOT NULL DEFAULT 'THB',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"),
        CONSTRAINT "FK_accounts_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_accounts_user_id_name" ON "accounts" ("user_id", "name")`,
    );

    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "kind" "public"."categories_kind_enum" NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"),
        CONSTRAINT "FK_categories_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_categories_user_id_name_kind" ON "categories" ("user_id", "name", "kind")`,
    );

    await queryRunner.query(`
      CREATE TABLE "monthly_budgets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "year" integer NOT NULL,
        "month" integer NOT NULL,
        "planned_expense_limit" numeric(14,2) NOT NULL,
        CONSTRAINT "PK_6ad918543354079fbc8e715ce34" PRIMARY KEY ("id"),
        CONSTRAINT "FK_monthly_budgets_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_monthly_budgets_user_month" ON "monthly_budgets" ("user_id", "year", "month")`,
    );

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(255) NOT NULL,
        "device_id" character varying(120) NOT NULL,
        "device_name" character varying(120),
        "user_agent" character varying(500),
        "ip_address" character varying(64),
        "status" "public"."sessions_status_enum" NOT NULL DEFAULT 'active',
        "last_activity_at" TIMESTAMPTZ NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_user_id_status" ON "sessions" ("user_id", "status")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_sessions_token_hash" ON "sessions" ("token_hash")`,
    );

    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "type" "public"."transactions_type_enum" NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "occurred_at" TIMESTAMPTZ NOT NULL,
        "note" text,
        "note_sanitized" text,
        CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transactions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_transactions_account_id" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_transactions_category_id" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_user_occurred_at" ON "transactions" ("user_id", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_account_occurred_at" ON "transactions" ("account_id", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_category_occurred_at" ON "transactions" ("category_id", "occurred_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "transaction_attachments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "transaction_id" uuid NOT NULL,
        "storage_key" character varying(255) NOT NULL,
        "original_filename" character varying(255) NOT NULL,
        "mime_type" character varying(120) NOT NULL,
        "file_size" integer NOT NULL,
        CONSTRAINT "PK_13b6fbadf7004f4ec40389d99b0" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transaction_attachments_transaction_id" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_transaction_attachments_transaction_id" ON "transaction_attachments" ("transaction_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_transaction_attachments_transaction_id"`);
    await queryRunner.query(`DROP TABLE "transaction_attachments"`);

    await queryRunner.query(`DROP INDEX "public"."idx_transactions_category_occurred_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_transactions_account_occurred_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_transactions_user_occurred_at"`);
    await queryRunner.query(`DROP TABLE "transactions"`);

    await queryRunner.query(`DROP INDEX "public"."idx_sessions_token_hash"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sessions_user_id_status"`);
    await queryRunner.query(`DROP TABLE "sessions"`);

    await queryRunner.query(`DROP INDEX "public"."idx_monthly_budgets_user_month"`);
    await queryRunner.query(`DROP TABLE "monthly_budgets"`);

    await queryRunner.query(`DROP INDEX "public"."idx_categories_user_id_name_kind"`);
    await queryRunner.query(`DROP TABLE "categories"`);

    await queryRunner.query(`DROP INDEX "public"."idx_accounts_user_id_name"`);
    await queryRunner.query(`DROP TABLE "accounts"`);

    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."sessions_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."categories_kind_enum"`);
    await queryRunner.query(`DROP TYPE "public"."accounts_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_locale_enum"`);
  }
}
