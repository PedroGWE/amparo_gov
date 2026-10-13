import { Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { InventoryMovementType } from '@prisma/client'
import { PartialType } from '@nestjs/mapped-types'

export class CreateInventoryItemDto {
  @IsString() @MinLength(2) @MaxLength(200) @Matches(/\S/) name: string
  @IsOptional() @IsString() @MaxLength(80) sku?: string
  @IsOptional() @IsString() @MaxLength(100) category?: string
  @IsOptional() @IsString() @MaxLength(20) unit?: string
  @IsOptional() @IsString() @MaxLength(120) location?: string
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) minimum_quantity?: number
}

export class UpdateInventoryItemDto extends PartialType(CreateInventoryItemDto) {
  @IsOptional() @IsBoolean() is_active?: boolean
}

export class InventoryMovementDto {
  @IsEnum(InventoryMovementType) type: InventoryMovementType
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity: number
  @IsOptional() @IsString() @MaxLength(500) note?: string
}

export class InventoryQueryDto {
  @IsOptional() @IsString() search?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number
  @IsOptional() @IsString() active?: string
}
