module Api
  module V1
    class DocumentsController < ApplicationController
      before_action :authenticate_user

      def index
        documents = Document.all
        
        # Scope documents based on user role and ownership
        if @current_user.technician?
          # Technicians see documents they uploaded or documents related to their applications
          technician_profile = @current_user.technician_profile
          if technician_profile
            documents = documents.where(
              "uploadable_type = 'TechnicianProfile' AND uploadable_id = ? OR " \
              "uploadable_type = 'JobApplication' AND uploadable_id IN (?)",
              technician_profile.id,
              technician_profile.job_applications.pluck(:id)
            )
          else
            documents = Document.none
          end
        elsif @current_user.company?
          # Companies see documents related to their jobs or company profile
          company_profile = @current_user.company_profile
          if company_profile
            company_jobs = company_profile.jobs.pluck(:id)
            documents = documents.where(
              "uploadable_type = 'CompanyProfile' AND uploadable_id = ? OR " \
              "uploadable_type = 'Job' AND uploadable_id IN (?) OR " \
              "uploadable_type = 'JobApplication' AND uploadable_id IN (?)",
              company_profile.id,
              company_jobs,
              JobApplication.where(job_id: company_jobs).pluck(:id)
            )
          else
            documents = Document.none
          end
        end
        
        render json: documents, each_serializer: DocumentSerializer, status: :ok
      end

      def show
        document = Document.find(params[:id])
        
        # Check if user has access to this document
        unless can_access_document?(document)
          return render json: { error: "Access denied" }, status: :forbidden
        end
        
        render json: document, serializer: DocumentSerializer, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Document not found" }, status: :not_found
      end

      def create
        document = Document.new(document_params)
        
        # Handle file attachment with better error handling
        if params[:file].present?
          begin
            document.file.attach(params[:file])
          rescue => e
            return render json: { error: "File attachment failed: #{e.message}" }, status: :unprocessable_entity
          end
        else
          return render json: { error: "File is required" }, status: :unprocessable_entity
        end

        if document.save
          render json: document, serializer: DocumentSerializer, status: :created
        else
          render json: { errors: document.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        document = Document.find(params[:id])
        
        # Check if user has access to this document
        unless can_access_document?(document)
          return render json: { error: "Access denied" }, status: :forbidden
        end
        
        if document.update(document_params)
          render json: document, serializer: DocumentSerializer, status: :ok
        else
          render json: { errors: document.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Document not found" }, status: :not_found
      end

      def destroy
        document = Document.find(params[:id])
        
        # Check if user has access to this document
        unless can_access_document?(document)
          return render json: { error: "Access denied" }, status: :forbidden
        end
        
        document.destroy
        head :no_content
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Document not found" }, status: :not_found
      end

      private

      def document_params
        params.permit(:uploadable_id, :uploadable_type, :doc_type)
      end
      
      def can_access_document?(document)
        case document.uploadable_type
        when 'TechnicianProfile'
          # Technicians can access their own profile documents
          if @current_user.technician?
            technician_profile = @current_user.technician_profile
            return technician_profile && document.uploadable_id == technician_profile.id
          end
        when 'CompanyProfile'
          # Companies can access their own profile documents
          if @current_user.company?
            company_profile = @current_user.company_profile
            return company_profile && document.uploadable_id == company_profile.id
          end
        when 'Job'
          # Companies can access documents for their jobs
          if @current_user.company?
            job = Job.find(document.uploadable_id)
            return job.company_profile.user_id == @current_user.id
          end
          # Technicians can access documents for jobs they've applied to
          if @current_user.technician?
            technician_profile = @current_user.technician_profile
            return technician_profile && technician_profile.job_applications.exists?(job_id: document.uploadable_id)
          end
        when 'JobApplication'
          # Technicians can access documents for their applications
          if @current_user.technician?
            technician_profile = @current_user.technician_profile
            return technician_profile && technician_profile.job_applications.exists?(id: document.uploadable_id)
          end
          # Companies can access documents for applications to their jobs
          if @current_user.company?
            job_application = JobApplication.find(document.uploadable_id)
            return job_application.job.company_profile.user_id == @current_user.id
          end
        end
        false
      end
    end
  end
end
