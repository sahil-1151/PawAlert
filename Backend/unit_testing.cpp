#include <iostream>
#include <cassert>
#include "auth_utils.h"

void test_encrypt_decrypt_roundtrip() {
    std::string original = "test123";
    std::string encrypted = encryptPassword(original);
    std::string decrypted = decryptPassword(encrypted);
    assert(decrypted == original);
    assert(encrypted != original);
    std::cout << "PASS: encrypt/decrypt roundtrip\n";
}

void test_different_passwords_give_different_hashes() {
    std::string encrypted1 = encryptPassword("password1");
    std::string encrypted2 = encryptPassword("password2");
    assert(encrypted1 != encrypted2);
    std::cout << "PASS: different passwords produce different hashes\n";
}

void test_token_roundtrip() {
    std::string token = generateToken(5, "admin");
    TokenData data = verifyToken(token);
    assert(data.valid == true);
    assert(data.user_id == 5);
    assert(data.role == "admin");
    std::cout << "PASS: token generate/verify roundtrip\n";
}

void test_invalid_token_rejected() {
    TokenData data = verifyToken("garbage_not_a_real_token");
    assert(data.valid == false);
    std::cout << "PASS: invalid token correctly rejected\n";
}

int main() {
    test_encrypt_decrypt_roundtrip();
    test_different_passwords_give_different_hashes();
    test_token_roundtrip();
    test_invalid_token_rejected();
    std::cout << "\nAll tests passed!\n";
    return 0;
}
