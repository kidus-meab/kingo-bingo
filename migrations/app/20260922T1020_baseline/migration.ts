#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/70eec4bda816665b0d4f0be210b71a929410effa4ee771b423330adbd8b060c1/contract';
import endContract from '../../snapshots/70eec4bda816665b0d4f0be210b71a929410effa4ee771b423330adbd8b060c1/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  foreignKey,
  primaryKey,
  unique,
} from '@prisma/orm-sqlite/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        table: 'calledNumber',
        columns: [
          col('calledAt', 'TEXT', { notNull: true, default: fn('now()') }),
          col('id', 'TEXT', { notNull: true }),
          col('order', 'INTEGER', { notNull: true }),
          col('roundId', 'TEXT', { notNull: true }),
          col('value', 'INTEGER', { notNull: true }),
        ],
        constraints: [
          primaryKey(['id']),
          unique(['roundId', 'value']),
          foreignKey(['roundId'], 'round', ['id']),
        ],
      }),
      this.createTable({
        table: 'cartela',
        columns: [
          col('cells', 'TEXT', { notNull: true }),
          col('id', 'TEXT', { notNull: true }),
          col('index', 'INTEGER', { notNull: true }),
        ],
        constraints: [primaryKey(['id']), unique(['index'])],
      }),
      this.createTable({
        table: 'playerCard',
        columns: [
          col('cartelaId', 'TEXT', { notNull: true }),
          col('id', 'TEXT', { notNull: true }),
          col('roundId', 'TEXT', { notNull: true }),
          col('userId', 'TEXT', { notNull: true }),
        ],
        constraints: [
          primaryKey(['id']),
          unique(['roundId', 'userId']),
          unique(['roundId', 'cartelaId']),
          foreignKey(['roundId'], 'round', ['id']),
          foreignKey(['userId'], 'user', ['id']),
          foreignKey(['cartelaId'], 'cartela', ['id']),
        ],
      }),
      this.createTable({
        table: 'room',
        columns: [
          col('code', 'TEXT', { notNull: true }),
          col('createdAt', 'TEXT', { notNull: true, default: fn('now()') }),
          col('hostUserId', 'TEXT'),
          col('id', 'TEXT', { notNull: true }),
          col('status', 'TEXT', { notNull: true }),
        ],
        constraints: [
          primaryKey(['id']),
          unique(['code']),
          foreignKey(['hostUserId'], 'user', ['id']),
        ],
      }),
      this.createTable({
        table: 'round',
        columns: [
          col('endedAt', 'TEXT'),
          col('id', 'TEXT', { notNull: true }),
          col('pattern', 'TEXT', { notNull: true }),
          col('roomId', 'TEXT', { notNull: true }),
          col('startedAt', 'TEXT'),
          col('status', 'TEXT', { notNull: true }),
        ],
        constraints: [primaryKey(['id']), foreignKey(['roomId'], 'room', ['id'])],
      }),
      this.createTable({
        table: 'user',
        columns: [
          col('createdAt', 'TEXT', { notNull: true, default: fn('now()') }),
          col('firstName', 'TEXT', { notNull: true }),
          col('id', 'TEXT', { notNull: true }),
          col('photoUrl', 'TEXT'),
          col('telegramId', 'TEXT', { notNull: true }),
          col('username', 'TEXT'),
        ],
        constraints: [primaryKey(['id']), unique(['telegramId'])],
      }),
      this.createTable({
        table: 'win',
        columns: [
          col('claimedAt', 'TEXT', { notNull: true, default: fn('now()') }),
          col('id', 'TEXT', { notNull: true }),
          col('pattern', 'TEXT', { notNull: true }),
          col('playerCardId', 'TEXT', { notNull: true }),
          col('roundId', 'TEXT', { notNull: true }),
          col('userId', 'TEXT', { notNull: true }),
        ],
        constraints: [
          primaryKey(['id']),
          foreignKey(['roundId'], 'round', ['id']),
          foreignKey(['userId'], 'user', ['id']),
          foreignKey(['playerCardId'], 'playerCard', ['id']),
        ],
      }),
      this.createIndex({
        table: 'calledNumber',
        index: 'calledNumber_roundId_idx_b7564116',
        columns: ['roundId'],
      }),
      this.createIndex({
        table: 'playerCard',
        index: 'playerCard_cartelaId_idx_13e8608d',
        columns: ['cartelaId'],
      }),
      this.createIndex({
        table: 'playerCard',
        index: 'playerCard_roundId_idx_b7564116',
        columns: ['roundId'],
      }),
      this.createIndex({
        table: 'playerCard',
        index: 'playerCard_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        table: 'room',
        index: 'room_hostUserId_idx_13a2bd65',
        columns: ['hostUserId'],
      }),
      this.createIndex({ table: 'round', index: 'round_roomId_idx_fe51d647', columns: ['roomId'] }),
      this.createIndex({
        table: 'win',
        index: 'win_playerCardId_idx_69f2cb48',
        columns: ['playerCardId'],
      }),
      this.createIndex({ table: 'win', index: 'win_roundId_idx_b7564116', columns: ['roundId'] }),
      this.createIndex({ table: 'win', index: 'win_userId_idx_a489d58a', columns: ['userId'] }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
