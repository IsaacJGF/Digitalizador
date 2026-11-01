export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      catalog_areas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_conteudos: {
        Row: {
          area_id: string
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          area_id: string
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          area_id?: string
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_conteudos_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "catalog_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_instituicoes: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_provas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_relacionados: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_subconteudos: {
        Row: {
          ativo: boolean
          conteudo_id: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          conteudo_id: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          conteudo_id?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_subconteudos_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "catalog_conteudos"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_tags: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          alternativas: Json
          ano: string | null
          area_geral: string | null
          conteudo: string | null
          conteudo_principal: string | null
          conteudos_relacionados: string[]
          created_at: string
          dificuldade: string | null
          disciplina: string | null
          enunciado: string
          enunciado_imagem: string | null
          enunciado_imagem_layout: Json | null
          enunciado_imagem_pos: string | null
          enunciado_imagens_extra: Json
          fonte: string | null
          grupo_id: string | null
          id: string
          imagem_original_url: string | null
          instituicao: string | null
          numero: string | null
          observacoes: string | null
          prova: string | null
          referencia_fonte: string | null
          referencia_imagem: string | null
          referencia_imagem_layout: Json | null
          referencia_imagem_pos: string | null
          referencia_imagens_extra: Json
          referencia_texto: string | null
          referencia_texto_apos: string | null
          resposta: string | null
          subconteudo_principal: string | null
          tags: string[] | null
          tags_livres: string[]
          tem_equacao: boolean
          tem_imagem: boolean
          tipo: string
          updated_at: string
        }
        Insert: {
          alternativas?: Json
          ano?: string | null
          area_geral?: string | null
          conteudo?: string | null
          conteudo_principal?: string | null
          conteudos_relacionados?: string[]
          created_at?: string
          dificuldade?: string | null
          disciplina?: string | null
          enunciado?: string
          enunciado_imagem?: string | null
          enunciado_imagem_layout?: Json | null
          enunciado_imagem_pos?: string | null
          enunciado_imagens_extra?: Json
          fonte?: string | null
          grupo_id?: string | null
          id?: string
          imagem_original_url?: string | null
          instituicao?: string | null
          numero?: string | null
          observacoes?: string | null
          prova?: string | null
          referencia_fonte?: string | null
          referencia_imagem?: string | null
          referencia_imagem_layout?: Json | null
          referencia_imagem_pos?: string | null
          referencia_imagens_extra?: Json
          referencia_texto?: string | null
          referencia_texto_apos?: string | null
          resposta?: string | null
          subconteudo_principal?: string | null
          tags?: string[] | null
          tags_livres?: string[]
          tem_equacao?: boolean
          tem_imagem?: boolean
          tipo?: string
          updated_at?: string
        }
        Update: {
          alternativas?: Json
          ano?: string | null
          area_geral?: string | null
          conteudo?: string | null
          conteudo_principal?: string | null
          conteudos_relacionados?: string[]
          created_at?: string
          dificuldade?: string | null
          disciplina?: string | null
          enunciado?: string
          enunciado_imagem?: string | null
          enunciado_imagem_layout?: Json | null
          enunciado_imagem_pos?: string | null
          enunciado_imagens_extra?: Json
          fonte?: string | null
          grupo_id?: string | null
          id?: string
          imagem_original_url?: string | null
          instituicao?: string | null
          numero?: string | null
          observacoes?: string | null
          prova?: string | null
          referencia_fonte?: string | null
          referencia_imagem?: string | null
          referencia_imagem_layout?: Json | null
          referencia_imagem_pos?: string | null
          referencia_imagens_extra?: Json
          referencia_texto?: string | null
          referencia_texto_apos?: string | null
          resposta?: string | null
          subconteudo_principal?: string | null
          tags?: string[] | null
          tags_livres?: string[]
          tem_equacao?: boolean
          tem_imagem?: boolean
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_catalog_usage: {
        Args: { _kind: string; _name: string }
        Returns: number
      }
      import_question_images_batch: {
        Args: { _items: Json }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
