#include "crow.h"
#include <pqxx/pqxx>
#include<ctime>
#include<sstream>
#include "secret_config.h"
#include "auth_utils.h"
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>

struct Job{
int case_id;
std::string description;
int priority; // priority goes up when number goes down.

bool operator<(const Job& other) const {
        return priority > other.priority;  // ULTA likha hai jaanbujh ke (neeche explain karunga)
    }
};
std::priority_queue<Job> jobQueue; // what are the jobs do we have.
std::mutex queueMutex;  // create a lock over an job so that we can prevent racecondition
std::condition_variable queueCV;
bool stopWorkers = false;

    void workerFunction(int worker_id) {
    while (true) {
        Job job;
        {
            std::unique_lock<std::mutex> lock(queueMutex);
            queueCV.wait(lock, [] { return !jobQueue.empty() || stopWorkers; });

            if (stopWorkers && jobQueue.empty()) {
                return;  // shutdown signal mila, aur kaam bhi khatam, ab thread band karo
            }

            job = jobQueue.top();
            jobQueue.pop();
        }

        // Job process karo (abhi ke liye simple print, real system mein yahan
        // actual notification bhejna ho sakta hai)
        std::cout << "[Worker " << worker_id << "] Processing case " << job.case_id 
                  << " (priority " << job.priority << "): " << job.description << std::endl;
        
        std::this_thread::sleep_for(std::chrono::milliseconds(500));  // simulate karo ki kaam mein time lagta hai
    }
    }

    bool isAuthorized(const crow::request& req, std::vector<std::string> allowed_roles, crow::response& res) {
    std::string token = req.get_header_value("Authorization");
    if (token.empty()) {
        crow::json::wvalue error;
        error["error"] = "No token provided";
        res = crow::response(401, error);
        return false;
    }

    TokenData tokenData = verifyToken(token);
    if (!tokenData.valid) {
        crow::json::wvalue error;
        error["error"] = "Invalid token";
        res = crow::response(401, error);
        return false;
    }

    bool roleMatched = false;
    for (const std::string& role : allowed_roles) {
        if (tokenData.role == role) {
            roleMatched = true;
            break;
        }
    }

    if (!roleMatched) {
        crow::json::wvalue error;
        error["error"] = "Forbidden: insufficient permissions";
        res = crow::response(403, error);
        return false;
    }

    return true;
    }
    
int main(){
    crow::SimpleApp app;  //this will create our server obj.

    int NUM_WORKERS = std::thread::hardware_concurrency();
    if (NUM_WORKERS == 0) NUM_WORKERS = 3;
    std::cout << "Detected " << NUM_WORKERS << " CPU cores. Starting " << NUM_WORKERS << " worker threads." << std::endl;
    std::vector<std::thread> workers;
    for (int i = 0; i < NUM_WORKERS; i++) {
        workers.emplace_back(workerFunction, i);
    }
    
    //http methods 

    CROW_ROUTE(app,"/db-test")([](){ // command is used to connect the db to the crow 
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER"))); // create a connection with database with dbname = pawalert ,
            pqxx::work txn(conn);

            pqxx::result r = txn.exec("SELECT area_name FROM area WHERE area_id = 1");
            txn.commit();

            std::string area_name = r[0][0].c_str();

            crow::json::wvalue response;
            response["connected"] = true;
            response["area_name"] = area_name;
            return crow::response(200, response);
        }
        catch (const std::exception& e) {
            crow::json::wvalue error;
            error["connected"] = false;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });


    CROW_ROUTE(app, "/")([](){                   //whenver some send get request "\" this function will gonna work.
        return "PawAlert server is running";
    });
    CROW_ROUTE(app,"/health")([](){              //this will send a proper json response return ,just like real api do .
        crow::json::wvalue response;
        response["service"] = "pawalert-backend";
        response["status"] = "ok";
        return response;
    });

    CROW_ROUTE(app, "/reports").methods(crow::HTTPMethod::POST)([](                //this is explicitly say it's post otherwise it will treat as get.
        const crow::request& req){
            auto body = crow::json::load(req.body);
            if(!body){
                return crow::response(400,"Invalid Json");
            }
            std::string animal_type = body["animal_type"].s();
            std::string condition = body["condition"].s();
            crow::json::wvalue response;
            response["report_id"] = 101;
            response["animal_type"] = animal_type;
            response["condition"] = condition;
            response["status"] = "pending";
            return crow::response(201, response);
                });
            CROW_ROUTE(app,"/cases/<int>/verify").methods(crow::HTTPMethod::PATCH)([](int case_id){
                crow::json::wvalue response;
                response["case_id"] = case_id;
                response["status"] = "verified";
                response["message"] = "case has been verified by moderator";
                return crow::response(200, response);
            });

    CROW_ROUTE(app,"/areas/<int>").methods(crow::HTTPMethod::PATCH)([](const crow::request& req, int area_id){ //patch request. 
        crow::response res;
        if(!isAuthorized(req, {"moderator", "admin"}, res)) {
            return res;
        }
        auto body = crow::json::load(req.body);
            if(!body) return crow::response(400, "INVALID JSON");
            std::string new_name = body["area_name"].s();

            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);

                txn.exec_params(
                    "UPDATE area SET area_name = $1 WHERE area_id = $2",
                    new_name, area_id
                );
                txn.commit();

                crow::json::wvalue response;
                response["area_id"] = area_id;
                response["area_name"] = new_name;
                return crow::response(200, response);
            }
            catch(const std::exception& e){
                crow::json::wvalue error;
                error["error"] = e.what();
                return crow::response(400, error);
            }
    });

    CROW_ROUTE(app,"/areas").methods(crow::HTTPMethod::POST)([](const crow::request& req){ //post request.
        crow::response res;
        if(!isAuthorized(req, {"moderator", "admin"}, res)) {
            return res;
        }
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400, "INVALID JSON");
        std::string area_name = body["area_name"].s();
            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);
                pqxx::result r = txn.exec_params(
                    "INSERT INTO area (area_name) VALUES ($1) RETURNING area_id",
                    area_name
                );
                txn.commit();
                crow::json::wvalue response;
                response["area_id"] = r[0][0].as<int>();
                response["area_name"] = area_name;
                return crow::response(201, response);
            }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
            }
        });

    CROW_ROUTE(app,"/areas")([](){  // get request.
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec("SELECT area_id, area_name FROM area");
            txn.commit();

            crow::json::wvalue response;
            int i = 0;
            for(auto row : r){
                response[i]["area_id"] = row["area_id"].as<int>();
                response[i]["area_name"] = row["area_name"].c_str();
                i++;
            }
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });

    CROW_ROUTE(app,"/resources").methods(crow::HTTPMethod::POST)([](const crow::request& req){  //post for resource.
        crow::response res;
        if(!isAuthorized(req, {"admin"}, res)) {
        return res;
        }   
        auto body = crow::json::load(req.body);
            if(!body) return crow::response(400, "INVALID JSON");
            std::string resource_type = body["resource_type"].s();
            std::string name = body["name"].s(); 
            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);
                pqxx::result r = txn.exec_params(
                    "INSERT INTO resource (resource_type,name) VALUES ($1 , $2) RETURNING resource_id",
                    resource_type,name
                );
                txn.commit();
                crow::json::wvalue response;
                response["resource_id"] = r[0][0].as<int>();
                response["resource_type"] = resource_type;
                response["name"] = name;
                return crow::response(201,response);
                }
            catch(const std::exception& e){
                crow::json::wvalue error;
                error["error"] = e.what();
                return crow::response(500 , error);
            }
    });

    CROW_ROUTE(app, "/resources")([](){  //get request for resource.
        try{
           pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec("SELECT resource_id,resource_type,name,available FROM resource");
            txn.commit(); 
            
            crow::json::wvalue response;
            int i=0;
            for(auto row : r){
                response[i]["resource_id"] = row["resource_id"].as<int>();
                response[i]["name"] = row["name"].c_str();
                response[i]["resource_type"] = row["resource_type"].c_str();
                response[i]["available"] = row["available"].c_str();
                i++;
            }
            return crow::response(200, response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });

    CROW_ROUTE(app,"/resources/<int>").methods(crow::HTTPMethod::PATCH)([](
        const crow::request& req,int resource_id){

        crow::response res;
        if(!isAuthorized(req, {"moderator","admin"}, res)) {
        return res;

            auto body = crow::json::load(req.body);
            if(!body) return crow::response(400, "INVALID JSON");
            bool available = body["available"].b();
            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);
        
                txn.exec_params(
                "UPDATE resource SET available = $1 WHERE resource_id = $2",
                available, resource_id
        );
        txn.commit();

        crow::json::wvalue response;
        response["resource_id"] = resource_id;
        response["available"] = available;
        return crow::response(200,response); 
            }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500,error);
        } 
        }
    });
    
    CROW_ROUTE(app,"/resources/<int>").methods(crow::HTTPMethod::DELETE)([](const crow::request& req,int resource_id){
        crow::response res;
        if(!isAuthorized(req,{"admin"},res)){
            return res;
        }

        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            txn.exec_params(
                "DELETE FROM resource WHERE resource_id = $1",resource_id);
            txn.commit();
            
            crow::json::wvalue response;
            response["resource_id"] = resource_id;
            response["message"] = "Resource deleted Suceesfully";
            return crow::response(200, response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"]=e.what();
            return crow::response(500, error);
        }
    });

    CROW_ROUTE(app,"/users").methods(crow::HTTPMethod::POST)([](const crow::request& req){   //sign up post request.
        auto body = crow::json::load(req.body);
            if(!body) return crow::response(400,"INVALID JSON");
            std::string name=body["name"].s();
            std::string email = body["email"].s();
            std::string password = body["password"].s();
            std::string encrypt_password = encryptPassword(password);
            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);

                pqxx::result r = txn.exec_params(
                    "INSERT INTO app_user(name,email,password_hash) VALUES ($1,$2,$3) RETURNING user_id",
                    name,email,encrypt_password
                );
                txn.commit();
                crow::json::wvalue response;
                response["user_id"] = r[0][0].as<int>();
                response["name"] = name;
                response["email"] = email;
                return crow::response(201,response);
            }
            catch(const std::exception& e){
                crow::json::wvalue error;
                error["error"] = e.what();
                return crow::response(500 , error);
            }
    });

    CROW_ROUTE(app,"/login").methods(crow::HTTPMethod::POST)([](const crow::request& req){
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400, "INVALID JSON");
        std::string email = body["email"].s();
        std::string password = body["password"].s();
        std::string encrypt_attempt = encryptPassword(password);
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec_params(
            "SELECT user_id, name, password_hash,role FROM app_user WHERE email = $1",
            email
            );
            txn.commit();
            if(r.empty()){
                crow::json::wvalue error;
                error["error"] = "User Not Found";
                return crow::response(404, error);
            }
            
            std::string stored_encrypted = r[0]["password_hash"].c_str();
            if (encrypt_attempt == stored_encrypted) {
                std::string role = r[0]["role"].c_str();  
                std::string token = generateToken(r[0]["user_id"].as<int>(), role);
    
                crow::json::wvalue response;
                response["user_id"] = r[0]["user_id"].as<int>();
                response["name"] = r[0]["name"].c_str();
                response["token"] = token;
                response["message"] = "Login successful";
                return crow::response(200, response);
            } else {
                crow::json::wvalue error;
                error["error"] = "Incorrect password";
                return crow::response(401, error);
            }
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500,error);
        }
    });

    CROW_ROUTE(app,"/users")([](const crow::request& req){
        crow::response res;
        if(!isAuthorized(req, {"admin"}, res)) {
            return res;
        }
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec(
                "SELECT user_id,name,email,role FROM app_user"
            );
            txn.commit();

            crow::json::wvalue response;
            int i=0;
            for(auto row : r){
                response[i]["user_id"] = row["user_id"].as<int>();
                response[i]["name"] = row["name"].c_str();
                response[i]["email"] = row["email"].c_str();
                response[i]["role"] = row["role"].c_str();
                i++;
            }
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error); 
        }
    });

    
    CROW_ROUTE(app,"/users/<int>").methods(crow::HTTPMethod::PATCH)([](const crow::request& req,int user_id){
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400,"INVALID JSON");
        std::string name = body["name"].s();
        std::string email = body["email"].s(); 
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            txn.exec_params(
                "UPDATE app_user SET name =$1,email = $2 WHERE user_id = $3",
                name,email,user_id);
            txn.commit();

            crow::json::wvalue response;
            response["user_id"] = user_id;
            response["name"] = name;
            response["email"] = email;
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500,error);
        }
    });
    CROW_ROUTE(app,"/users/<int>/password").methods(crow::HTTPMethod::PATCH)([](const crow::request &req,int user_id){
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400,"INVALID JSON");
        std::string current_password = body["current_password"].s();
        std::string new_password = body["new_password"].s();
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec_params(
                "SELECT password_hash FROM app_user WHERE user_id = $1",
                user_id
            );

            if (r.empty()) {
                crow::json::wvalue error;
                error["error"] = "User not found";
                return crow::response(404, error);
            }
            std::string stored_encrypted = r[0]["password_hash"].c_str();
            std::string current_encrypted = encryptPassword(current_password);

            bool passwordMatches = (current_encrypted == stored_encrypted);

            if (!passwordMatches) {
                crow::json::wvalue error;
                error["error"] = "Current password is incorrect";
                return crow::response(401, error);
            }
            std::string new_encrypted = encryptPassword(new_password);
            txn.exec_params(
            "UPDATE app_user SET password_hash = $1 WHERE user_id = $2",
            new_encrypted, user_id
            );
            txn.commit();
            crow::json::wvalue response;
            response["user_id"]=user_id;
            response["message"]="Password Updated Successfully";
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });
    
    CROW_ROUTE(app,"/moderators").methods(crow::HTTPMethod::POST)([](const crow::request& req){ // moderator - post request.
        crow::response res;
        if(!isAuthorized(req,{"admin"},res)){
            return res;
        }
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400 ,"INVALID JSON");
        int user_id = body["user_id"].i();
        int area_id = body["area_id"].i();
        try{
             pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec_params(
                "INSERT INTO moderator(user_id,area_id) VALUES ($1,$2) RETURNING moderator_id",
                user_id,area_id
            );
            txn.commit();
            crow::json::wvalue response;
            response["moderator_id"] = r[0][0].as<int>();
            response["user_id"] = user_id;
            response["area_id"] = area_id;
            return crow::response(201, response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500,error);
        }
    });

    CROW_ROUTE(app,"/moderators")([](const crow::request& req){
        crow::response res;
        if(!isAuthorized(req,{"admin"},res)){
            return res;
        }
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec(
                "SELECT moderator_id,user_id,area_id FROM moderator"
            );
            txn.commit();

            crow::json::wvalue response;
            int i=0;
            for(auto row : r){
                response[i]["moderator_id"] = row["moderator_id"].as<int>();
                response[i]["user_id"] = row["user_id"].as<int>();
                response[i]["area_id"] = row["area_id"].as<int>();
                i++;
            }
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500 , error);
        }
    });
    CROW_ROUTE(app,"/moderators/<int>").methods(crow::HTTPMethod::PATCH)([](const crow::request& req,int moderator_id){ //moderator patch request.
        crow::response res;
        if(!isAuthorized(req,{"admin"},res)){
            return res;
        }
        auto body = crow::json::load(req.body);
        if(!body)return crow::response(400 ,"INVALID JSON");
        int area_id = body["area_id"].i();
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec_params(
                "UPDATE moderator SET area_id = $1 WHERE moderator_id = $2",
                area_id,moderator_id
            );
            txn.commit();

            crow::json::wvalue response;
            response["moderator_id"] = moderator_id;
            response["area_id"]= area_id;
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });

    CROW_ROUTE(app,"/moderators/<int>").methods(crow::HTTPMethod::DELETE)([](const crow::request& req,int moderator_id){ //moderator -delete request.
        crow::response res;
        if (!isAuthorized(req, {"admin"}, res)) {
            return res;
        }
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            txn.exec_params(
                "DELETE FROM moderator WHERE moderator_id =$1",
                moderator_id
            );
            txn.commit();
            crow::json::wvalue response;
            response["moderator_id"] = moderator_id;
            response["message"] = "Moderator Removed Successfully";
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });

    CROW_ROUTE(app,"/reports")([](){
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);
            pqxx::result r = txn.exec(
                "SELECT report_id,animal_type,condition,area_id,created_at FROM report"
            );
            crow::json::wvalue response;
            int i=0;
            for(auto row :r){
                response[i]["report_id"] = row["report_id"].as<int>();
                response[i]["animal_type"] = row["animal_type"].c_str();
                response[i]["condition"] = row["condition"].c_str();
                response[i]["area_id"] = row["area_id"].as<int>();
                response[i]["created_at"] = row["created_at"].c_str();
                i++;
            }
            return crow::response(200, response);
        }
            catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
           }

    });

    CROW_ROUTE(app,"/reports/<int>").methods(crow::HTTPMethod::DELETE)([](const crow::request& req,int report_id){
        crow::response res;
        if(!isAuthorized(req,{"admin"},res)){
            return res;
        }
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            txn.exec_params(
                "DELETE FROM report where report_id = $1",report_id);
            txn.commit();
            crow::json::wvalue response;
            response["report_id"]=report_id;
            response["message"]="Report deleted successfully";
            return crow::response(200, response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500 ,error);
        }
    });

   CROW_ROUTE(app, "/reports/full").methods(crow::HTTPMethod::POST)([](const crow::request& req){
    auto body = crow::json::load(req.body);
    if(!body) return crow::response(400, "INVALID JSON");

    std::string animal_type = body["animal_type"].s();
    std::string condition = body["condition"].s();
    int area_id = body["area_id"].i();
    int priority = body.has("priority") ? body["priority"].i() : 2;   // naya: body se priority lo

    try{
        pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
        pqxx::work txn(conn);

        pqxx::result r1 = txn.exec_params(
            "INSERT INTO report (animal_type,condition,area_id) VALUES ($1,$2,$3) RETURNING report_id",
            animal_type, condition, area_id
        );
        int report_id = r1[0][0].as<int>();

        std::string priority_label = (priority == 1) ? "urgent" : "routine";   // naya: number ko label mein badlo

        pqxx::result r2 = txn.exec_params(
            "INSERT INTO animal_case (report_id, priority, status) VALUES ($1, $2, 'pending') RETURNING case_id",
            report_id, priority_label
        );
        int case_id = r2[0][0].as<int>();
        txn.commit();

        {
            std::lock_guard<std::mutex> lock(queueMutex);
            jobQueue.push({case_id, "New report needs moderator attention", priority});   // ab variable use ho raha hai
        }
        queueCV.notify_one();

        crow::json::wvalue response;
        response["report_id"] = report_id;
        response["case_id"] = case_id;
        response["status"] = "pending";
        return crow::response(201, response);
    }
    catch (const std::exception& e) {
        crow::json::wvalue error;
        error["error"] = e.what();
        return crow::response(500, error);
    }
});

    CROW_ROUTE(app,"/case_status_history")([](const crow::request& req){    //get request for case_status_history.
        crow::response res;
        if(!isAuthorized(req,{"admin"},res)){
            return res;
        }
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);
            pqxx::result r = txn.exec(
                "SELECT history_id,case_id,status,change_at FROM case_status_history"
            );
            crow::json::wvalue response;
            int i=0;
            for(auto row : r){
                response[i]["history_id"] = row["history_id"].as<int>();
                response[i]["case_id"] = row["case_id"].as<int>();
                response[i]["status"] = row["status"].c_str();
                response[i]["change_at"] = row["change_at"].c_str();
                i++;
            }
            return crow::response(200, response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });
    
    CROW_ROUTE(app,"/case_status_history").methods(crow::HTTPMethod::POST)([](const crow::request& req){
        crow::response res;
        if(!isAuthorized(req,{"admin","moderator"},res)){
            return res;
        }
        auto body =crow::json::load(req.body);
        if(!body) return crow::response(400,"INVALID JSON");
        int case_id = body["case_id"].i();
        std::string status = body["status"].s();
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec_params(
                "INSERT INTO case_status_history (case_id, status) VALUES ($1, $2) RETURNING history_id",
                case_id, status
            );
            txn.commit();

            crow::json::wvalue response;
            response["history_id"] = r[0][0].as<int>();
            response["case_id"] = case_id;
            response["status"] = status;
            return crow::response(201, response);
        }
        catch(const std::exception e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });

    CROW_ROUTE(app, "/notifications")([](const crow::request& req){
        crow::response res;
        if(!isAuthorized(req,{"admin","moderator"},res)){
            return res;
        }
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);
            pqxx::result r = txn.exec(
                "SELECT notification_id,case_id,message,sent FROM notification"
            );
            txn.commit();
            crow::json::wvalue response;
            int i=0;
            for(auto row : r){
                response[i]["notification_id"] = row["notification_id"].as<int>();
                response[i]["case_id"] = row["case_id"].as<int>();
                response[i]["message"] = row["message"].c_str();
                response[i]["sent"] = row["sent"].as<bool>();
                i++;
            }
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });

    CROW_ROUTE(app,"/notifications").methods(crow::HTTPMethod::POST)([](const crow::request& req){
        crow::response res;
        if(!isAuthorized(req,{"admin","moderator"},res)){
            return res;
        }
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400,"INVALID JSON");
        std::string message = body["message"].s();
        int case_id = body["case_id"].i();
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec_params(
                "INSERT INTO notification (case_id, message) VALUES ($1, $2) RETURNING notification_id",
                case_id, message
            );
            txn.commit();
            crow::json::wvalue response;
            response["notification_id"] = r[0][0].as<int>();
            response["case_id"] = case_id;
            response["message"] = message;
            response["sent"] = false;
            return crow::response(201, response);

            
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });

    CROW_ROUTE(app,"/actions")([](const crow::request& req){
        crow::response res;
        if(!isAuthorized(req,{"admin","moderator"},res)){
            return res;
        }
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);
            pqxx::result r = txn.exec(
                "SELECT action_id,case_id,resource_id,action_type,performed_at FROM action"
            );
            txn.commit();
            crow::json::wvalue response;
            int i=0;
            for(auto row : r){
                response[i]["action_id"] = row["action_id"].as<int>();
                response[i]["case_id"] = row["case_id"].as<int>(); 
                response[i]["resource_id"] = row["resource_id"].as<int>();
                response[i]["action_type"] = row["action_type"].c_str();
                response[i]["performed_at"] = row["performed_at"].c_str();
                i++;
            }
            return crow::response(200, response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });
    CROW_ROUTE(app,"/actions").methods(crow::HTTPMethod::POST)([](const crow::request& req){
        crow::response res;
        if (!isAuthorized(req, {"moderator", "admin"}, res)) {   
            return res;
        }
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400, "INVALID JSON");
        int case_id = body["case_id"].i();
        int resource_id = body["resource_id"].i();
        std::string action_type = body["action_type"].s();
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);
            pqxx::result r = txn.exec_params(
                "INSERT INTO action(case_id,resource_id,action_type) VALUES ($1, $2, $3) RETURNING action_id",
                case_id, resource_id ,action_type
            );
            txn.commit();
            crow::json::wvalue response;
            response["action_id"] = r[0][0].as<int>();
            response["case_id"] = case_id;
            response["resource_id"] = resource_id;
            response["action_type"] = action_type;
            return crow::response(201, response);
        }

        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });

    //-------------------------till here we have completed all the backend which is related to database ------------------------------------------------------------------


    CROW_ROUTE(app,"/verify-token").methods(crow::HTTPMethod::POST)([](const crow::request& req){
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400, "INVALID JSON");
        std::string token = body["token"].s();
        TokenData data = verifyToken(token);

        crow::json::wvalue response;
        response["valid"] = data.valid;
        if(data.valid){
            response["user_id"] = data.user_id;
            response["role"] = data.role;
        }
        return crow::response(200, response);
    });

    CROW_ROUTE(app,"/users/<int>/role").methods(crow::HTTPMethod::PATCH)([](const crow::request& req,int user_id){
    crow::response res;                          
    if (!isAuthorized(req,{"admin"}, res)) {     
        return res;                               
    }
    auto body = crow::json::load(req.body);
    if(!body) return crow::response(400, "INVALID JSON");
    std::string new_role = body["role"].s();

    try{
        pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
        pqxx::work txn(conn);

        txn.exec_params(
            "UPDATE app_user SET role = $1 WHERE user_id = $2",
            new_role, user_id
        );
        txn.commit();

        crow::json::wvalue response;
        response["user_id"] = user_id;
        response["role"] = new_role;
        return crow::response(200, response);
    }
    catch(const std::exception& e){
        crow::json::wvalue error;
        error["error"] = e.what();
        return crow::response(500, error);
    }

    });

    CROW_ROUTE(app,"/dashboard/summary")([](const crow::request& req){
        crow::response res;
        if(!isAuthorized(req,{"moderator","admin"},res)){
            return res;
        }
        try{
        pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
        pqxx::work txn(conn);

        pqxx::result pendingCount = txn.exec("SELECT COUNT(*) FROM animal_case WHERE status = 'pending'");
        
        pqxx::result areaWise = txn.exec(
            "SELECT a.area_name, COUNT(ac.case_id) AS pending_cases "
            "FROM animal_case ac "
            "JOIN report r ON ac.report_id = r.report_id "
            "JOIN area a ON r.area_id = a.area_id "
            "WHERE ac.status = 'pending' "
            "GROUP BY a.area_name "
            "ORDER BY pending_cases DESC"
        );

        txn.commit();
        crow::json::wvalue response;
        response["total_pending"] = pendingCount[0][0].as<int>();
        int i=0;
        for(auto row:areaWise){
            response["area_wise_pending"][i]["area_name"] = row["area_name"].c_str();
            response["area_wise_pending"][i]["pending_cases"] = row["pending_cases"].as<int>();
            i++;
        }
        return crow::response(200, response);
        }
    catch(const std::exception& e){
        crow::json::wvalue error;
        error["error"] = e.what();
        return crow::response(500, error);
    }
    });

    app.port(8080).multithreaded().run();        //serve this server on port 8080 and we can handle multiple request which is imp for os.
    {
        std::lock_guard<std::mutex> lock(queueMutex);
        stopWorkers = true;
    }
    queueCV.notify_all();
    for (auto& w : workers) {
        w.join();
    }

    return 0;
}