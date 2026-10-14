import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator'
export class LoginDto {
  @IsOptional() @IsEmail() email?: string
  @IsOptional() @Matches(/^[A-Za-z0-9-]{3,30}$/) matricula?: string
  @IsOptional() @IsIn(['aluno', 'professor', 'gestor']) portal?: string
  @IsString() @MinLength(8) password: string
  @IsString() tenantSlug: string
}
